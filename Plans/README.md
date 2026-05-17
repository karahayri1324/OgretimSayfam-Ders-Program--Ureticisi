# Plans/ — Ders Program Oluşturucu Planlama Klasörü

ÖğretimSayfam'ın "Ders Program Oluşturucu" Electron uygulamasının tüm planlama dokümantasyonu.

## Okuma Sırası

1. [00_OVERVIEW.md](00_OVERVIEW.md) — Proje nedir, ne yapar
2. [01_ARCHITECTURE.md](01_ARCHITECTURE.md) — Sistem mimarisi, klasör yapısı
3. [02_FET_INTEGRATION.md](02_FET_INTEGRATION.md) — FET nasıl entegre edilir
4. [03_AI_DATASET.md](03_AI_DATASET.md) — AI dataset stratejisi
5. [04_AI_SYSTEM_PROMPT.md](04_AI_SYSTEM_PROMPT.md) — AI'a verilen system prompt
6. [05_OUTPUT_SCHEMA.md](05_OUTPUT_SCHEMA.md) — AI'ın output JSON şeması
7. [06_FRONTEND_UI.md](06_FRONTEND_UI.md) — UI tasarımı, ekranlar
8. [07_BACKEND_API.md](07_BACKEND_API.md) — Electron main process API'leri
9. [08_DATABASE_SCHEMA.md](08_DATABASE_SCHEMA.md) — SQLite schema
10. [09_MILESTONES.md](09_MILESTONES.md) — Geliştirme fazları
11. [10_TESTING.md](10_TESTING.md) — Test stratejisi

## Alt Klasörler

- **agents/** — Sub-agent şablonları (dataset üretimi, code implementer)
- **memory/** — Geliştirme günlüğü, kararlar, ilerleme
- **dataset_samples/** — Üretilen AI training data örnekleri (JSONL)

## Hızlı Referans

| Konu | Doküman |
|---|---|
| Hangi FET kısıtlamaları destekleniyor? | [02](02_FET_INTEGRATION.md) — bölüm "Kısıtlama Tipleri" |
| AI ne dönüyor? | [05](05_OUTPUT_SCHEMA.md) |
| Sol panel tasarımı? | [06](06_FRONTEND_UI.md) — bölüm "AI Chat Paneli" |
| SQLite tabloları? | [08](08_DATABASE_SCHEMA.md) |
| Hangi sırayla geliştirilecek? | [09](09_MILESTONES.md) |
