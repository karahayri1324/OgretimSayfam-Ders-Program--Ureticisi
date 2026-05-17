# Dataset Samples

Türkçe doğal dil → AI constraint JSON dataset.

## Dosyalar

- `system_prompt.txt` — Production'da kullanılacak system prompt (Plans/04_AI_SYSTEM_PROMPT'un sıkıştırılmış hali)
- `names_*.txt` — Üretim sırasında kullanılacak Türkçe isim havuzları (öğretmen, branş, sınıf, derslik)
- `*.jsonl` — Constraint tipi başına bir dosya (henüz boş — agent'ler doldurur)
- `train_test_split/` — %85/%15 ayrılmış set'ler (final adım)

## Format (JSONL)

Her satır bir örnek:
```json
{"messages":[
  {"role":"system","content":"<system prompt>"},
  {"role":"user","content":"[CONTEXT]\\n...\\n[/CONTEXT]\\n\\n[USER_REQUEST]\\nAhmet hoca cuma yok\\n[/USER_REQUEST]"},
  {"role":"assistant","content":"<JSON yanıt>"}
]}
```

## Hedef Sayılar

Plans/03_AI_DATASET.md tablosuna bakın. Toplam ~2100 örnek.

## Üretim

Plans/agents/dataset_generator_agent.md şablonuna uygun olarak
constraint tipi başına bir agent çağrısı yapılır. Detaylar Plans/03'te.

## Doğrulama

`scripts/validate_dataset.ts` (yazılacak):
1. JSON validity
2. Zod schema match (Plans/05)
3. Round-trip: AI output → constraint-mapper → FET XML
4. Edge case: Türkçe karakterler korunuyor mu
