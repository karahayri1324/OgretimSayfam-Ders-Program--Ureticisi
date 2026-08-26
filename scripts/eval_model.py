#!/usr/bin/env python3
"""Fine-tune sonrası model kalite ölçüm harness'i.

Eskiden eval.jsonl'i tüketen TEK SATIR kod yoktu — modelin gerçekten öğrenip öğrenmediğini
ölçen hiçbir otomatik kontrol bulunmuyordu. Bu script held-out eval setini kullanır:

  1. İSTATİSTİK MODU (varsayılan, endpoint'siz):
       python scripts/eval_model.py
     eval.jsonl'in kategori/kind dağılımını, kapsama boşluklarını ve kısıt-tipi çeşitliliğini
     raporlar (test öncesi setin sağlığını görmek için).

  2. CANLI MOD (--endpoint ile):
       python scripts/eval_model.py --endpoint http://192.168.1.21:8000/v1/chat/completions \
           --model maarifx --limit 500
     Her eval örneğinin [CONTEXT]+[USER_REQUEST]'ini modele gönderir (son assistant hariç),
     dönen yanıtı şema-geçerlilik + beklenen-kind + (constraint için) tip-eşleşmesi açısından
     ölçer; genel + kategori-bazlı doğruluk raporlar.

Not: build_messages ile aynı mesaj sırasını kullanır — sadece son assistant'ı düşürüp modele
sorar. Serving katmanının inference.py ile aynı formatı ürettiğini varsayar.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVAL_PATH = ROOT / "Plans" / "dataset_samples" / "train_test_split" / "eval.jsonl"

VALID_KINDS = {
    "constraint", "query", "tool_call", "schedule_update", "data_mutation", "run_solver",
}


def load_eval(path: Path) -> list[dict]:
    if not path.exists():
        print(f"HATA: eval seti yok: {path}", file=sys.stderr)
        print("Önce dataset üretin: python scripts/generate_dataset.py", file=sys.stderr)
        sys.exit(2)
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def expected_kind(row: dict) -> str:
    asst = [m for m in row["messages"] if m["role"] == "assistant"]
    if not asst:
        return "?"
    try:
        return json.loads(asst[-1]["content"]).get("kind", "constraint")
    except Exception:
        return "?"


def expected_obj(row: dict) -> dict | None:
    asst = [m for m in row["messages"] if m["role"] == "assistant"]
    if not asst:
        return None
    try:
        return json.loads(asst[-1]["content"])
    except Exception:
        return None


def constraint_types(obj: dict | None) -> set[str]:
    if not obj:
        return set()
    return {c.get("type") for c in obj.get("constraints", []) if isinstance(c, dict)}


def schema_ok(obj: dict) -> bool:
    """Hafif şema kontrolü (zod'un Python karşılığı değil; kaba geçerlilik)."""
    if not isinstance(obj, dict):
        return False
    kind = obj.get("kind", "constraint")
    if kind not in VALID_KINDS:
        return False
    if kind == "constraint":
        return isinstance(obj.get("constraints"), list)
    if kind == "query":
        return isinstance(obj.get("answer"), str)
    if kind == "tool_call":
        return isinstance(obj.get("tool"), str) and bool(obj.get("tool"))
    if kind == "data_mutation":
        return isinstance(obj.get("actions"), list) and len(obj.get("actions", [])) >= 1
    if kind == "schedule_update":
        return isinstance(obj.get("action"), str)
    if kind == "run_solver":
        return True
    return False


# ------------------------------ İSTATİSTİK MODU ------------------------------
def report_stats(rows: list[dict]) -> None:
    kinds = Counter(expected_kind(r) for r in rows)
    ctypes: Counter = Counter()
    for r in rows:
        ctypes.update(constraint_types(expected_obj(r)))
    print(f"\n=== Eval Seti İstatistikleri ({len(rows)} örnek) ===")
    print("\nKind dağılımı:")
    for k, n in kinds.most_common():
        print(f"  {k:20s} {n:>5} (%{n / len(rows) * 100:.1f})")
    print(f"\nEval'de temsil edilen kısıt tipi sayısı: {len([t for t in ctypes if t])}")
    print("En sık 10 kısıt tipi:")
    for t, n in ctypes.most_common(10):
        if t:
            print(f"  {t:36s} {n:>4}")

    # Kapsama boşluğu: şemadaki tüm kısıt tiplerinden eval'de HİÇ olmayanlar
    schema_path = ROOT / "electron" / "ai" / "schema.ts"
    all_types = _schema_constraint_types(schema_path)
    missing = sorted(t for t in all_types if t not in ctypes)
    if missing:
        print(f"\nUYARI: {len(missing)}/{len(all_types)} kısıt tipi eval'de HİÇ yok:")
        for t in missing:
            print(f"  - {t}")
    else:
        print(f"\nOK: {len(all_types)} kısıt tipinin tümü eval'de temsil ediliyor.")


def _schema_constraint_types(schema_path: Path) -> set[str]:
    if not schema_path.exists():
        return set()
    txt = schema_path.read_text(encoding="utf-8")
    import re
    m = re.search(r"ConstraintTypeEnum\s*=\s*z\.enum\(\[(.*?)\]\)", txt, re.S)
    if not m:
        return set()
    return set(re.findall(r"'([A-Z_]+)'", m.group(1)))


# ------------------------------ CANLI MOD ------------------------------
def run_live(rows: list[dict], endpoint: str, model: str, limit: int) -> None:
    try:
        import httpx
    except ImportError:
        print("HATA: canlı mod için httpx gerekli (pip install httpx).", file=sys.stderr)
        sys.exit(2)

    sample = rows[:limit] if limit else rows
    n = len(sample)
    schema_valid = 0
    kind_match = 0
    ctype_match = 0
    by_kind: dict[str, dict] = defaultdict(lambda: {"total": 0, "kind_ok": 0, "schema_ok": 0})

    print(f"\n=== Canlı Eval ({n} örnek → {endpoint}) ===")
    for i, row in enumerate(sample):
        prompt_msgs = [m for m in row["messages"] if m["role"] != "assistant"]
        # Çok-turlu örneklerde ara assistant tool_call'ları korunmalı; yalnız SON assistant'ı at.
        msgs = row["messages"][:-1] if row["messages"][-1]["role"] == "assistant" else row["messages"]
        exp_kind = expected_kind(row)
        by_kind[exp_kind]["total"] += 1
        try:
            resp = httpx.post(
                endpoint,
                json={"model": model, "messages": msgs, "temperature": 0.0,
                      "max_tokens": 1024, "stream": False, "chat_template_kwargs": {"enable_thinking": False}},
                timeout=120,
            )
            content = resp.json()["choices"][0]["message"]["content"]
            obj = _coerce_json(content)
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i}] istek/parse hatası: {exc}", file=sys.stderr)
            continue

        if isinstance(obj, dict) and schema_ok(obj):
            schema_valid += 1
            by_kind[exp_kind]["schema_ok"] += 1
            got_kind = obj.get("kind", "constraint")
            if got_kind == exp_kind:
                kind_match += 1
                by_kind[exp_kind]["kind_ok"] += 1
                if exp_kind == "constraint":
                    if constraint_types(obj) == constraint_types(expected_obj(row)):
                        ctype_match += 1
        if (i + 1) % 50 == 0:
            print(f"  ... {i + 1}/{n} işlendi")

    print("\n--- Sonuç ---")
    print(f"Şema geçerli   : {schema_valid}/{n} (%{schema_valid / n * 100:.1f})")
    print(f"Kind eşleşme   : {kind_match}/{n} (%{kind_match / n * 100:.1f})")
    n_con = by_kind.get("constraint", {}).get("total", 0)
    if n_con:
        print(f"Kısıt-tipi tam : {ctype_match}/{n_con} (%{ctype_match / n_con * 100:.1f})")
    print("\nKind bazında (kind_ok / total):")
    for k, info in sorted(by_kind.items()):
        t = info["total"]
        print(f"  {k:20s} {info['kind_ok']:>4}/{t:<4} (%{info['kind_ok'] / t * 100:.1f})")


def _coerce_json(raw):
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return raw
    s = raw.strip()
    if s.startswith("```"):
        parts = s.split("```", 2)
        if len(parts) >= 2:
            chunk = parts[1]
            if chunk.lower().startswith("json"):
                chunk = chunk[4:]
            s = chunk.strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        i, j = s.find("{"), s.rfind("}")
        if i >= 0 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                pass
    return raw


def main() -> None:
    ap = argparse.ArgumentParser(description="Fine-tuned model eval harness")
    ap.add_argument("--endpoint", help="vLLM/OpenAI-uyumlu /v1/chat/completions URL'i (canlı mod)")
    ap.add_argument("--model", default="maarifx", help="upstream model adı")
    ap.add_argument("--limit", type=int, default=0, help="canlı modda örnek sınırı (0=tümü)")
    ap.add_argument("--eval", type=Path, default=EVAL_PATH, help="eval.jsonl yolu")
    args = ap.parse_args()

    rows = load_eval(args.eval)
    report_stats(rows)
    if args.endpoint:
        run_live(rows, args.endpoint, args.model, args.limit)
    else:
        print("\n(Canlı ölçüm için --endpoint verin. Şimdilik yalnız istatistik gösterildi.)")


if __name__ == "__main__":
    main()
