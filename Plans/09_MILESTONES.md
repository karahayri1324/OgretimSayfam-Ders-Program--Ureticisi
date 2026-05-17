# Geliştirme Fazları (Milestones) — FİNAL STATE

> Tüm M0–M8 tamamlandı (2026-05-17). Bu dosya artık geçmiş kayıt amaçlı.

## ✅ M0 — Planlama
- Plans/ 11 doküman
- Agent şablonları
- Memory kurulumu

## ✅ M1 — Electron iskeleti
- electron-vite + React + Tailwind
- AppShell (AI sağda 420px, Cursor benzeri)
- 13 sayfa skeleton

## ✅ M2 — Veri katmanı
- SQLite v1 + v2 migration (split_group_id, day_hours)
- 14 repository
- IPC handler'ları
- DB konum: `~/Documents/ÖğretimSayfam Ders Programı/veri.db`

## ✅ M3 — UI ekranları
- 13 sayfa (Welcome wizard, CRUD'lar, Generate, Timetable, Settings, Advanced)
- AI panel: copy, clear, quick-start, kategori rozeti
- Virgülle toplu giriş (sınıf, derslik, ders)
- Activities "Toplu Ekle" (Ders + Saat + Çoklu Sınıf)
- Sınıflarda "sınıf adıyla aynı derslik" otomatik yaratım
- Constraints 8 preset buton

## ✅ M4 — FET entegrasyonu
- 60/60 constraint type için XML handler
- Split activities (aynı saat, farklı oda — auto subgroup)
- Per-day hours (kısa gün için ConstraintBreakTimes)
- XML builder + runner + parser
- gerçek fet-cl çağrımı

## ✅ M5 — AI katmanı
- 5 response kind: constraint / query / tool_call / schedule_update / data_mutation
- 23 data_mutation op (CRUD)
- 9 read-only tool + iteratif tool_call (max 3)
- schedule_update DB'ye yansır
- Multi-turn (son 10 mesaj context'e)
- Wizard mode (sıfırdan rehberlik)
- Mock server 70+ pattern

## ✅ M6 — Dataset
- 102,276 örnek (19 kategori)
- 97,276 train / 5,000 eval split
- Zod %100 valid
- 906 MB

## ✅ M7 — Test + cilalama
- 99/99 test geçiyor (10 dosya)
- TypeScript 0 hata
- 16 kritik bug fix (son turda)
- Loading + empty state'ler
- Türkçe metinler i18n.ts

## ✅ M8 — Paketleme
- AppImage Linux build (125 MB)
- fet-cl bundled
- Native modüller rebuild
- DB legacy migration (eski → yeni konum)
- Smoke test temiz

## Bekleyen / Sonraki Adımlar

| İş | Sahip |
|---|---|
| Local LLM fine-tune (Qwen2.5-7B LoRA, 2 epoch) | Kullanıcı |
| Production AI endpoint deploy | Kullanıcı |
| Ayarlar → AI Endpoint URL bağla | Kullanıcı |
| Windows NSIS + Mac DMG build | İhtiyaç olduğunda |
| Icon (PNG/ICO/ICNS) | Cilalama |
| Schedule global-tab incremental update (FK cascade riski) | Future |
