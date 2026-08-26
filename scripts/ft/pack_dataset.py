#!/usr/bin/env python3
"""Ders Programı SFT datasetini Qwen3.5 formatında paketler (ZERO TRUNCATION).

Neden paketleme: train.jsonl'de her örneğin system prompt'u 5.390 token, geri kalanı
ortalama 448 token. Yani token'ın ~%92'si her satırda tekrar eden aynı metin. Aynı
system altında birden fazla (user, assistant) turunu tek diziye koyunca aynı veri
~5 kat daha az forward-pass ile görülür.

Neden burada tokenize ediyoruz: label maskesini eğitim sırasında token id'lerini
tarayarak çıkarmak kırılgan. Burada her bloğu ayrı tokenize edip assistant span'larını
kesin olarak biliyoruz, sonra assert'lerle doğruluyoruz.

TRUNCATION GARANTİSİ:
  - tokenizer hiçbir yerde truncation=True ile çağrılmaz
  - bir paket max_seq'i aşacaksa yeni paket açılır
  - system + tek bir tur bile max_seq'e sığmıyorsa: örnek KESİLMEZ, hata verilir
    (--max-seq'i büyüt). Sessiz veri kaybı yok.

Çıktı: <out>/packed.npz  (flat int32 token dizisi + paket offsetleri + label span'ları)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from transformers import AutoTokenizer

# Template'in ürettiği bloklar (preserve_thinking=True ile birebir eşleşir; verify_render
# bunu her koşuda kanıtlar).
SYS_FMT = "<|im_start|>system\n{c}<|im_end|>\n"
USER_FMT = "<|im_start|>user\n{c}<|im_end|>\n"
ASST_PREFIX = "<|im_start|>assistant\n"
ASST_BODY_FMT = "<think>\n\n</think>\n\n{c}<|im_end|>"
TURN_TAIL = "\n"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--max-seq", type=int, default=8192)
    p.add_argument(
        "--max-turns",
        type=int,
        default=0,
        help="paket başına en fazla kaç (user,assistant) turu; 0=sınırsız (sadece max-seq sınırlar)",
    )
    p.add_argument("--limit", type=int, default=0, help="ilk N satır (smoke için)")
    p.add_argument("--verify-every", type=int, default=2000)
    p.add_argument(
        "--row-per-pack",
        action="store_true",
        help="her satır kendi paketinde (inference dağılımıyla birebir; packing yok). "
        "Bu modda bir satırın turları ASLA bölünmez.",
    )
    p.add_argument(
        "--sample-frac",
        type=float,
        default=1.0,
        help="katmanlı örneklem oranı (1.0=tamamı). Sınıf = kind + kısıt tipi.",
    )
    p.add_argument(
        "--min-per-class",
        type=int,
        default=400,
        help="nadir sınıflar bu sayının altındaysa tamamı alınır (kapsama kaybı olmasın)",
    )
    return p.parse_args()


def row_class(turns: list[tuple[str, str]]) -> str:
    """Katman etiketi: son assistant cevabının kind'i (+ constraint ise tipi).

    Kategori bilgisi train.jsonl'de tutulmuyor (dosyalar birleştirilmiş), bu yüzden
    etiketi cevabın kendisinden türetiyoruz.
    """
    try:
        obj = json.loads(turns[-1][1])
    except (json.JSONDecodeError, IndexError):
        return "?"
    kind = obj.get("kind", "constraint")
    if kind == "constraint":
        cons = obj.get("constraints") or []
        if cons and isinstance(cons[0], dict):
            return f"constraint:{cons[0].get('type', '?')}"
        return "constraint:?"
    if kind == "data_mutation":
        # Dataset'in GERÇEK anahtarı "actions" (generate_dataset.py her yerde onu üretir).
        # Yalnız operations/mutations aranınca bu dal hiç çalışmıyordu ve TÜM data_mutation
        # örnekleri (dataset'in ~%36'sı) tek bir "data_mutation" sınıfına çöküyordu →
        # katmanlı örnekleme nadir op'ları (set_day_hours vb.) koruyamıyordu.
        ops = obj.get("actions") or obj.get("operations") or obj.get("mutations") or []
        if ops and isinstance(ops[0], dict):
            return f"data_mutation:{ops[0].get('op') or ops[0].get('type') or '?'}"
    if kind == "tool_call":
        return f"tool_call:{obj.get('tool') or (obj.get('tool_call') or {}).get('name') or '?'}"
    return str(kind)


def stratified_pick(
    labels: list[str], frac: float, min_per_class: int, seed: int = 42
) -> tuple[list[int], dict]:
    """Sınıf başına orantılı seçim; nadir sınıflarda tam kapsama."""
    import collections
    import random as _random

    by_class: dict[str, list[int]] = collections.defaultdict(list)
    for i, lab in enumerate(labels):
        by_class[lab].append(i)
    rng = _random.Random(seed)
    keep: list[int] = []
    report: dict = {}
    for lab, idxs in by_class.items():
        if len(idxs) <= min_per_class:
            take = len(idxs)  # nadir sınıf: tamamını al
        else:
            take = max(min_per_class, int(round(len(idxs) * frac)))
            take = min(take, len(idxs))
        sel = idxs if take == len(idxs) else rng.sample(idxs, take)
        keep.extend(sel)
        report[lab] = {"toplam": len(idxs), "alinan": take}
    keep.sort()
    return keep, report


def verify_render(tok, system: str, turns: list[tuple[str, str]]) -> None:
    """Elle inşa ettiğimiz string, chat template'in ürettiğiyle birebir aynı mı?

    Aynı değilse eğitim formatı inference formatından sapar — sessizce devam etmek yerine
    patlıyoruz.
    """
    msgs = [{"role": "system", "content": system}]
    for u, a in turns:
        msgs.append({"role": "user", "content": u})
        msgs.append({"role": "assistant", "content": a})
    ref = tok.apply_chat_template(
        msgs, tokenize=False, add_generation_prompt=False, preserve_thinking=True
    )
    ours = SYS_FMT.format(c=system) + "".join(
        USER_FMT.format(c=u) + ASST_PREFIX + ASST_BODY_FMT.format(c=a) + TURN_TAIL
        for u, a in turns
    )
    if ref != ours:
        raise SystemExit(
            "FATAL: elle inşa edilen render chat template ile eşleşmiyor.\n"
            f"--- template ---\n{ref[:1200]!r}\n--- ours ---\n{ours[:1200]!r}"
        )


def encode(tok, text: str) -> list[int]:
    return tok(text, add_special_tokens=False, truncation=False)["input_ids"]


def main() -> int:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    print(f"tokenizer ← {args.model}")
    tok = AutoTokenizer.from_pretrained(str(args.model), trust_remote_code=True)

    # --- 1) satırları oku, system'in tekilliğini doğrula -------------------------------
    system: str | None = None
    rows: list[list[tuple[str, str]]] = []  # her satır: [(user, assistant), ...]
    n_lines = 0
    with args.data.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            msgs = json.loads(line)["messages"]
            if msgs[0]["role"] != "system":
                raise SystemExit(f"satır {n_lines}: ilk mesaj system değil")
            if system is None:
                system = msgs[0]["content"]
            elif msgs[0]["content"] != system:
                raise SystemExit(
                    f"satır {n_lines}: system prompt farklı — INFERENCE_CONTRACT byte-eşliği bozulur"
                )
            turns: list[tuple[str, str]] = []
            rest = msgs[1:]
            if len(rest) % 2 != 0:
                raise SystemExit(f"satır {n_lines}: user/assistant çiftleri eşleşmiyor")
            for i in range(0, len(rest), 2):
                u, a = rest[i], rest[i + 1]
                if u["role"] != "user" or a["role"] != "assistant":
                    raise SystemExit(f"satır {n_lines}: beklenmeyen rol sırası")
                turns.append((u["content"], a["content"]))
            rows.append(turns)
            n_lines += 1
            if args.limit and n_lines >= args.limit:
                break
    assert system is not None
    print(f"satır={n_lines}  toplam tur={sum(len(r) for r in rows)}")

    # --- 1b) katmanlı örneklem ---------------------------------------------------------
    strat_report: dict | None = None
    if args.sample_frac < 1.0:
        labels = [row_class(r) for r in rows]
        keep, strat_report = stratified_pick(labels, args.sample_frac, args.min_per_class)
        rows = [rows[i] for i in keep]
        n_lines = len(rows)
        full = sum(v["toplam"] for v in strat_report.values())
        print(
            f"katmanlı örneklem: {len(strat_report)} sınıf, {full} → {n_lines} satır "
            f"({100 * n_lines / full:.1f}%), tam alınan nadir sınıf="
            f"{sum(1 for v in strat_report.values() if v['toplam'] == v['alinan'])}"
        )

    verify_render(tok, system, rows[0])
    print("render doğrulaması: template ile birebir eşleşiyor ✓")

    # --- 2) blokları tokenize et -------------------------------------------------------
    sys_ids = encode(tok, SYS_FMT.format(c=system))
    print(f"system bloğu = {len(sys_ids)} token")
    budget = args.max_seq - len(sys_ids)
    if budget <= 0:
        raise SystemExit(f"max-seq ({args.max_seq}) system bloğundan ({len(sys_ids)}) küçük")

    tokens: list[int] = []
    pack_offsets: list[int] = [0]
    label_spans: list[tuple[int, int]] = []  # global (start, end) — end exclusive
    spans_per_pack: list[int] = []

    cur: list[int] = list(sys_ids)
    cur_spans: list[tuple[int, int]] = []  # paket-içi göreli
    cur_turns = 0
    n_packs = 0
    max_turn_len = 0
    turn_lens: list[int] = []

    def flush() -> None:
        nonlocal cur, cur_spans, cur_turns, n_packs
        if not cur_spans:
            return
        if len(cur) > args.max_seq:  # olmamalı — güvenlik kilidi
            raise SystemExit(f"BUG: paket {len(cur)} token, max {args.max_seq}")
        base = len(tokens)
        tokens.extend(cur)
        for s, e in cur_spans:
            label_spans.append((base + s, base + e))
        spans_per_pack.append(len(cur_spans))
        pack_offsets.append(len(tokens))
        n_packs += 1
        cur = list(sys_ids)
        cur_spans = []
        cur_turns = 0

    verified = 0
    for ri, turns in enumerate(rows):
        if args.row_per_pack:
            # Satır sınırı = paket sınırı. Bir satırın turları asla bölünmez (çok turlu
            # örneklerde geçmiş kopmasın), farklı satırlar da asla aynı pakete girmez
            # (eğitim formatı inference ile birebir aynı olsun).
            flush()
        for u, a in turns:
            u_ids = encode(tok, USER_FMT.format(c=u))
            p_ids = encode(tok, ASST_PREFIX)
            a_ids = encode(tok, ASST_BODY_FMT.format(c=a))
            t_ids = encode(tok, TURN_TAIL)
            turn_len = len(u_ids) + len(p_ids) + len(a_ids) + len(t_ids)
            turn_lens.append(turn_len)
            max_turn_len = max(max_turn_len, turn_len)

            if turn_len > budget:
                raise SystemExit(
                    f"satır {ri}: tek tur {turn_len} token, system sonrası bütçe {budget}.\n"
                    "Örnek KESİLMEDİ. --max-seq değerini en az "
                    f"{len(sys_ids) + turn_len} yapıp tekrar çalıştır."
                )
            if len(cur) + turn_len > args.max_seq:
                if args.row_per_pack and cur_spans:
                    # Aynı satırın turları paket sınırında bölünemez — bölseydik çok turlu
                    # örneğin geçmişi kopardı. Kesmek yerine duruyoruz.
                    raise SystemExit(
                        f"satır {ri}: çok turlu satır toplamı {len(cur) + turn_len} token, "
                        f"max-seq {args.max_seq}. Örnek KESİLMEDİ/BÖLÜNMEDİ. "
                        f"--max-seq en az {len(cur) + turn_len} olmalı."
                    )
                flush()
            elif args.max_turns and cur_turns >= args.max_turns:
                flush()

            start = len(cur) + len(u_ids) + len(p_ids)  # assistant gövdesi (think dahil)
            cur.extend(u_ids)
            cur.extend(p_ids)
            cur.extend(a_ids)
            end = len(cur)  # <|im_end|> dahil
            cur.extend(t_ids)
            cur_spans.append((start, end))
            cur_turns += 1

        # periyodik doğrulama: parça-parça tokenizasyon == bütün-string tokenizasyonu
        if args.verify_every and ri % args.verify_every == 0 and ri > 0:
            whole = encode(
                tok,
                SYS_FMT.format(c=system)
                + "".join(
                    USER_FMT.format(c=u) + ASST_PREFIX + ASST_BODY_FMT.format(c=a) + TURN_TAIL
                    for u, a in turns
                ),
            )
            piecewise = list(sys_ids)
            for u, a in turns:
                piecewise += encode(tok, USER_FMT.format(c=u))
                piecewise += encode(tok, ASST_PREFIX)
                piecewise += encode(tok, ASST_BODY_FMT.format(c=a))
                piecewise += encode(tok, TURN_TAIL)
            if whole != piecewise:
                raise SystemExit(f"satır {ri}: parça-parça tokenizasyon bütünle eşleşmiyor")
            verified += 1
            print(f"  …{ri}/{n_lines} paket={n_packs} (doğrulama {verified} ok)", flush=True)

    flush()

    tokens_np = np.asarray(tokens, dtype=np.int32)
    offs_np = np.asarray(pack_offsets, dtype=np.int64)
    spans_np = np.asarray(label_spans, dtype=np.int64).reshape(-1, 2)
    spp_np = np.asarray(spans_per_pack, dtype=np.int32)

    # --- 3) son güvenlik kontrolleri ---------------------------------------------------
    lens = np.diff(offs_np)
    assert lens.max() <= args.max_seq, "paket max_seq'i aşmış"
    assert len(spans_np) == sum(len(r) for r in rows), "tur sayısı kaybolmuş/çoğalmış"
    assert spp_np.sum() == len(spans_np)
    for s, e in spans_np[:200]:
        assert e > s
    label_tok = int((spans_np[:, 1] - spans_np[:, 0]).sum())

    out = args.out / "packed.npz"
    np.savez(
        out,
        tokens=tokens_np,
        pack_offsets=offs_np,
        label_spans=spans_np,
        spans_per_pack=spp_np,
    )
    meta = {
        "data": str(args.data),
        "model": str(args.model),
        "max_seq": args.max_seq,
        "n_rows": n_lines,
        "n_turns": int(len(spans_np)),
        "n_packs": int(n_packs),
        "system_tokens": len(sys_ids),
        "total_tokens": int(tokens_np.size),
        "label_tokens": label_tok,
        "label_ratio": round(label_tok / int(tokens_np.size), 4),
        "pack_len_mean": float(lens.mean()),
        "pack_len_max": int(lens.max()),
        "turns_per_pack_mean": round(len(spans_np) / n_packs, 2),
        "turn_len_max": max_turn_len,
        "turn_len_mean": round(float(np.mean(turn_lens)), 1),
        "truncated": 0,
        "row_per_pack": bool(args.row_per_pack),
        "sample_frac": args.sample_frac,
        "pack_len_p99": int(np.percentile(lens, 99)),
        "stratified": strat_report,
    }
    (args.out / "pack_meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"→ {out}  ({tokens_np.nbytes / 1e9:.2f} GB)")
    print("TRUNCATE EDİLEN ÖRNEK: 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
