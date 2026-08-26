#!/usr/bin/env python3
"""Ders Programı SFT — Qwen3.5-MoE üzerine LoRA adapter.

train_sft_konu.py'den farkları (hepsi bu dataset için zorunlu):
  1. system prompt DATASETTE gömülü — script ayrıca enjekte etmez (INFERENCE_CONTRACT
     byte-eşliği bozulmasın diye).
  2. tools chat template'e verilmez — bu dataset native tool_call kullanmaz, tool çağrısı
     assistant JSON'unun içinde (kind:"tool_call").
  3. Girdi, pack_dataset.py'nin ürettiği önceden tokenize edilmiş packed.npz — label
     span'ları kesin, token id taramasına dayalı kırılgan maskeleme yok, truncation yok.
  4. Varsayılan merge YOK: çıktı sadece adapter. vLLM base modeli --enable-lora ile
     yükleyip adapter'ı ayrı bir served-model-name altında sunar (base'e dokunulmaz).

MoE notu: LoRA router'a ve routed expert bank'larına takılmaz (VRAM + PEFT router'ı
saramaz); attention + shared expert MLP eğitilir.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import torch
import torch.utils.checkpoint as ckpt
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer,
    Qwen3_5MoeForConditionalGeneration,
    Trainer,
    TrainingArguments,
)
from transformers.models.qwen3_5_moe import modeling_qwen3_5_moe as _qwen_moe

try:
    from peft import LoraConfig, TaskType, get_peft_model
except ImportError as e:  # pragma: no cover
    raise SystemExit(f"peft required: {e}") from e


# --- Bellek yaması 1/2: expert döngüsünü iç-checkpoint'e al ---------------------------
# Qwen3_5MoeExperts.forward 256 expert üzerinde Python döngüsü koşar ve her expert kendi
# ara tensörlerini backward için saklar. Katman-düzeyi checkpointing bunu kurtarmıyor;
# ölçtüğümüz maliyet 3571 KB/token. Expert bloğunu ayrıca checkpoint'leyince 568 KB/token'a
# düşüyor (19x), 8192'lik paketler 4.4 GB'a sığıyor.
_orig_experts_forward = _qwen_moe.Qwen3_5MoeExperts.forward


def _checkpointed_experts_forward(self, hidden_states, top_k_index, top_k_weights):
    if self.training and torch.is_grad_enabled():
        return ckpt.checkpoint(
            _orig_experts_forward,
            self,
            hidden_states,
            top_k_index,
            top_k_weights,
            use_reentrant=False,
        )
    return _orig_experts_forward(self, hidden_states, top_k_index, top_k_weights)


_qwen_moe.Qwen3_5MoeExperts.forward = _checkpointed_experts_forward


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--packed", type=Path, required=True, help="pack_dataset.py çıktısı packed.npz")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--lora-r", type=int, default=32)
    p.add_argument("--lora-alpha", type=int, default=64)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--warmup-ratio", type=float, default=0.03)
    p.add_argument("--weight-decay", type=float, default=0.0)
    p.add_argument("--logging-steps", type=int, default=10)
    p.add_argument("--save-steps", type=int, default=250)
    p.add_argument("--max-packs", type=int, default=0, help="0=all (smoke için sınırla)")
    p.add_argument("--resume", action="store_true")
    return p.parse_args()


class PackedDataset(Dataset):
    """Önceden tokenize edilmiş paketler. Hiçbir kesme/pad burada yapılmaz."""

    def __init__(self, npz_path: Path, max_packs: int = 0):
        z = np.load(npz_path)
        self.tokens = z["tokens"]
        self.offsets = z["pack_offsets"]
        spans = z["label_spans"]
        spp = z["spans_per_pack"]
        # span'ları pakete göre grupla
        self.spans_by_pack: list[np.ndarray] = []
        c = 0
        for k in spp:
            self.spans_by_pack.append(spans[c : c + int(k)])
            c += int(k)
        self.n = len(self.spans_by_pack)
        if max_packs and max_packs < self.n:
            self.n = max_packs
        lens = np.diff(self.offsets)[: self.n]
        print(
            f"packs={self.n} tokens={int(lens.sum()):,} "
            f"len(mean={lens.mean():.0f} max={lens.max()})"
        )

    def __len__(self) -> int:
        return self.n

    def __getitem__(self, i: int) -> dict:
        s, e = int(self.offsets[i]), int(self.offsets[i + 1])
        ids = self.tokens[s:e].astype(np.int64)
        labels = np.full(len(ids), -100, dtype=np.int64)
        for a, b in self.spans_by_pack[i]:
            labels[int(a) - s : int(b) - s] = ids[int(a) - s : int(b) - s]
        assert (labels != -100).any(), f"paket {i}: hiç label yok"
        return {
            "input_ids": ids,
            "attention_mask": np.ones(len(ids), dtype=np.int64),
            "labels": labels,
        }


class SelectiveCELossTrainer(Trainer):
    """Bellek yaması 2/2: lm_head + cross-entropy YALNIZCA label olan pozisyonlarda.

    vocab 248.320 olduğu için 8192 token'lık logits tensörü float32'de 7.6 GB — tek başına
    OOM sebebi. Bu datasette token'ın sadece %8,7'si label (gerisi system prompt + user),
    dolayısıyla logits'in %91'i hesaplanıp atılıyordu. Sadece gerekli pozisyonları
    hesaplamak matematiksel olarak aynı loss'u verir, belleği ~11 kat düşürür.
    """

    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        labels = inputs["labels"]
        base = model.base_model.model if hasattr(model, "base_model") else model
        hidden = base.model(
            input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"]
        ).last_hidden_state

        shift_labels = labels[:, 1:].reshape(-1)
        shift_hidden = hidden[:, :-1].reshape(-1, hidden.size(-1))
        idx = (shift_labels != -100).nonzero(as_tuple=True)[0]
        sel_logits = base.lm_head(shift_hidden.index_select(0, idx)).float()
        sel_labels = shift_labels.index_select(0, idx)

        if num_items_in_batch is not None:
            # Trainer token-ağırlıklı toplama yapıyor: sum döndür, o böler.
            loss = torch.nn.functional.cross_entropy(
                sel_logits, sel_labels, reduction="sum"
            ) / num_items_in_batch
        else:
            loss = torch.nn.functional.cross_entropy(sel_logits, sel_labels)
        return (loss, None) if return_outputs else loss


def collate(features: list[dict], pad_id: int) -> dict:
    max_len = max(len(f["input_ids"]) for f in features)
    out = {"input_ids": [], "attention_mask": [], "labels": []}
    for f in features:
        pad = max_len - len(f["input_ids"])
        out["input_ids"].append(np.concatenate([f["input_ids"], np.full(pad, pad_id, np.int64)]))
        out["attention_mask"].append(np.concatenate([f["attention_mask"], np.zeros(pad, np.int64)]))
        out["labels"].append(np.concatenate([f["labels"], np.full(pad, -100, np.int64)]))
    return {k: torch.from_numpy(np.stack(v)) for k, v in out.items()}


def pick_target_modules(model) -> list[str]:
    """LoRA yalnızca nn.Linear yapraklarına. Bare 'gate' (Qwen3_5MoeTopKRouter) hedeflenmez;
    routed expert bank'ları atlanır, shared_expert kalır."""
    allowed = {
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
        "in_proj", "out_proj",
    }
    names: set[str] = set()
    for name, mod in model.named_modules():
        if not isinstance(mod, torch.nn.Linear):
            continue
        lname = name.lower()
        if any(x in lname for x in ("visual", "vision", "vit")):
            continue
        if ".experts." in lname and "shared" not in lname:
            continue
        leaf = name.split(".")[-1]
        if leaf in allowed:
            names.add(leaf)
    if not names:
        names = {"q_proj", "k_proj", "v_proj", "o_proj"}
    print("LoRA target modules:", sorted(names))
    return sorted(names)


def main() -> int:
    args = parse_args()
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    torch.manual_seed(args.seed)

    out_dir = args.output.resolve()
    adapter_dir = out_dir / "adapter"
    adapter_dir.mkdir(parents=True, exist_ok=True)

    print("=== Ders Programı SFT (LoRA adapter, merge yok) ===")
    print(f"model  : {args.model}")
    print(f"packed : {args.packed}")
    print(f"out    : {out_dir}")
    print(f"epochs={args.epochs} lr={args.lr} r={args.lora_r} alpha={args.lora_alpha}")

    ds = PackedDataset(args.packed, args.max_packs)

    tokenizer = AutoTokenizer.from_pretrained(str(args.model), trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    pad_id = tokenizer.pad_token_id or tokenizer.eos_token_id

    print("Model yükleniyor…")
    model = Qwen3_5MoeForConditionalGeneration.from_pretrained(
        str(args.model),
        dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    for n, p in model.named_parameters():
        if any(x in n.lower() for x in ("visual", "vision", "vit")):
            p.requires_grad = False

    model.config.use_cache = False
    if hasattr(model.config, "text_config"):
        model.config.text_config.use_cache = False
    # use_reentrant=False şart: reentrant sürüm PEFT ile donuk girdilerde grad zincirini kırar
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()
    # Checkpointing yalnızca model.training True iken uygulanır (modeling kodundaki
    # `self.gradient_checkpointing and self.training` koşulu). Trainer bunu yapıyor ama
    # burada da garantiye alıyoruz — eval modunda bellek 6 katına çıkıyor.
    model.train()

    lora = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=pick_target_modules(model),
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    targs = TrainingArguments(
        output_dir=str(adapter_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        save_total_limit=5,
        bf16=True,
        fp16=False,
        optim="adamw_torch",
        report_to=[],
        remove_unused_columns=False,
        dataloader_num_workers=2,
        gradient_checkpointing=True,
        max_grad_norm=1.0,
        seed=args.seed,
        disable_tqdm=True,  # detached koşuda log dosyasını şişirmesin
    )

    trainer = SelectiveCELossTrainer(
        model=model,
        args=targs,
        train_dataset=ds,
        data_collator=lambda feats: collate(feats, pad_id),
    )

    print("Eğitim başlıyor…", flush=True)
    train_out = trainer.train(resume_from_checkpoint=args.resume or None)
    print("train metrics:", train_out.metrics)

    print(f"Adapter kaydediliyor → {adapter_dir}")
    model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    pack_meta_path = args.packed.parent / "pack_meta.json"
    meta = {
        "base_model": str(args.model.resolve()),
        "packed": str(args.packed.resolve()),
        "pack_meta": json.loads(pack_meta_path.read_text()) if pack_meta_path.exists() else None,
        "epochs": args.epochs,
        "lr": args.lr,
        "lora_r": args.lora_r,
        "lora_alpha": args.lora_alpha,
        "target_modules": lora.target_modules,
        "metrics": train_out.metrics,
        "n_packs": len(ds),
        "merged": False,
        "serve_hint": (
            "vllm serve <BASE> --enable-lora --max-lora-rank "
            f"{args.lora_r} --lora-modules dersprog={adapter_dir}"
        ),
    }
    (adapter_dir / "train_meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
    )
    print("DONE — merge yapılmadı, base model dokunulmadı.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
