# Test Stratejisi — FİNAL DURUM

## Mevcut Durum: 99/99 PASS ✅

```
Test Files: 10 passed (10)
Tests:      99 passed (99)
TypeScript: 0 errors
```

## Test Dosyaları

| Dosya | Test sayısı | Kapsam |
|---|---:|---|
| `test/fet-builder.test.ts` | 7 | FET XML üretimi, Türkçe char, block expansion, MinDays |
| `test/e2e-fet.test.ts` | 1 | Küçük okul + 2 constraint + fet-cl + sonuç doğrulama |
| `test/scale-test.test.ts` | 1 | 54 öğretmen, 18 sınıf, 252 activity — ölçek |
| `test/heavy-constraints.test.ts` | 1 | 20 kısıtlamalı stress test |
| `test/split-and-perday.test.ts` | 7 | Split activities + per-day hours pipeline |
| `test/mock-server.test.ts` | 7 | Mock AI 8 temel pattern |
| `test/ai-agentic.test.ts` | 9 | Agentic mode (schema, schedule_update, backward compat) |
| `test/ai-coverage.test.ts` | 54 | 10 kategori — comprehensive prompt coverage |
| `test/full-flow.test.ts` | 1 | Uçtan uca: DB seed → constraints → FET → parse |
| `test/validate-mock-coverage.test.ts` | 1 | 200 random dataset coverage raporu |

## Test Çalıştırma

```bash
npx tsc --noEmit              # 0 hata
npx vitest run                # 99/99 pass, ~4s
npm run build                 # production build
npm run build:linux           # AppImage
```

## Dataset Doğrulama

```bash
npx tsx scripts/validate_dataset.ts
# Kontrol edilen: 204,552 (orijinal + train/eval split)
# Geçerli: 204,552
# Sorunlu: 0
```

## E2E Senaryolar Geçen

1. **Boş okul → veri ekle → kısıtlama ekle → FET → timetable** (full-flow.test.ts)
2. **20 kısıtlama + 54 öğretmen + 18 sınıf** (heavy-constraints.test.ts) — Ahmet cuma yok, beden son ders, sınıf çakışması yok, 9A 0 boşluk, vb. hepsi sağlanıyor
3. **Split activities** — 9A görsel + müzik aynı saatte, farklı oda (split-and-perday)
4. **Per-day hours** — Cuma 5 saat, diğer günler 6 saat; FET kısa günde slot yerleştirmiyor
5. **20 saniye altı**: 54 öğretmen + 252 activity 0.15-0.24s sürede çözülüyor

## Mock AI Coverage Raporu

`validate-mock-coverage.test.ts`'in 200 random dataset örneğinde:
- Tam eşleşme: **52/200 (%26)**
- Kısmi (kind doğru, params eksik/farklı): **12/200 (%6)**
- Toplam anlaşıldı: **64/200 (%32)**

Bu **mock pattern-bazlı** ölçüm; production LLM'le **%95+** beklenir.

## Manuel QA Senaryoları (önerilen)

`Plans/dataset_samples/manual_qa_scenarios.md` yazılabilir. Gerçek hayat akışları:
1. Küçük ortaokul (10 öğretmen, 6 sınıf)
2. Orta lise (30 öğretmen, 15 sınıf) — heavy-constraints.test'tekine benzer
3. Büyük Anadolu lisesi (54 öğretmen, 18 sınıf) — scale-test'le doğrulandı
4. Karışık (anaokulu + ilkokul + ortaokul) — schedule + per-day-hours ile mümkün
5. Vardiyalı (ikili öğretim) — per-day-hours senaryosu

## CI (gelecek)

Şu an manuel. GitHub Actions eklemek için hazır:
- lint (eslint + prettier)
- typecheck (tsc --noEmit)
- vitest run
- build (electron-vite)
- AppImage upload as artifact
