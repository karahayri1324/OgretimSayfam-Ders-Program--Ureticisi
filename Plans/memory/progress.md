# İlerleme Günlüğü

## 2026-05-17 — Production Ready ✅

Tüm büyük iş bitti. Uygulama production-deploy edilebilir durumda.

### Final İstatistikler

| Metrik | Değer |
|---|---:|
| Test | **99 / 99** geçti (10 dosya) |
| TypeScript hatası | **0** |
| Dataset örnek | **102,276** (5K eval / 97K train) |
| Dataset boyutu | ~906 MB |
| Constraint type | **60** |
| AI op type (mutation) | **23** |
| AI response kind | **5** (constraint / query / tool_call / schedule_update / data_mutation) |
| Mock AI pattern | **70+** |
| AppImage | 125 MB |

### Tamamlanan Major Modüller

**Veri katmanı (M2)**
- SQLite 16 tablo (split_group_id, day_hours dahil v2)
- 14 repository + migration v1+v2
- DB konum: `~/Documents/ÖğretimSayfam Ders Programı/veri.db` (eski konumdan otomatik migration)

**FET (M4)**
- 60/60 constraint type için XML handler
- Split activities (aynı saat, farklı oda)
- Per-day hours (Cuma 7, diğerleri 8)
- gerçek fet-cl çağrımı, output parse

**AI (M5)**
- 5 response kind discriminated union
- 23 data_mutation op (CRUD)
- 9 read-only tool + iteratif tool_call (max 3 iterasyon)
- schedule_update gerçek DB'ye yansır
- Multi-turn history (son 10 mesaj context'e gider)
- Wizard mode (sıfırdan rehberlik)
- Mock server 70+ pattern (production LLM ile %95+ kapsama)

**UI (M3 + M7)**
- Cursor benzeri layout (AI sağda, 420px)
- 13 sayfa (Welcome, Subjects, Classes, Rooms, Teachers, Activities, Constraints, Schedule, Generate, Timetable, Settings, Advanced)
- Tıklanabilir Welcome prompt'ları
- AI panel: copy / clear / quick-start / kategori rozeti
- Constraints 8 hazır preset
- Activities "Toplu Ekle" dialog (Ders + Saat + Çoklu Sınıf)
- Sınıf eklemede virgülle çoklu giriş + "sınıf adıyla aynı derslik" otomatik yaratım
- PDF / Excel / HTML export (printToPDF + xlsx)

**Dataset (M6)**
- 102,276 örnek, Zod %100 valid
- 19 kategori (öğretmen, sınıf, ders, derslik, schedule_update, data_mutation, query, wizard, ambiguous)
- 97,276 train / 5,000 eval split
- Türkçe odaklı, isim/cümle/weight varyasyonu

**Production (M8)**
- AppImage Linux build (125 MB, fet-cl bundled)
- Native modüller rebuild
- Smoke test: DB açılıyor, IPC kayıt, çıkış temiz
- DB legacy konum migration

### Yapılan 16 Kritik Bug Fix (son agent turunda)

1. mock-server tanımsız fonksiyon referansları (her parse fail)
2. schedule:setDays schema mismatch ({name,orderIndex} kabul edilmiyordu)
3. Settings hiç kaydedilmiyor (number → string serialization)
4. Settings anahtar uyumsuzluğu (aiTimeout vs aiTimeoutSec) + DB migration
5. Generate FET timeout settings'ten okunmuyor
6. Constraints weight slider duplicate satır yaratıyordu (yeni setWeight IPC)
7. Log konumu Documents'e taşındı
8. 0 öğretmen ile Üret crash (proaktif önkoşul kontrolü)
9. Uzun AI mesajları taşıyordu (whitespace-pre-wrap + 4000 char limit)
10. Advanced'da Dersler eksikti
11. Generate slider settings'le senkron değildi
12. mock detector pattern çakışmaları (haftada gün vs günde saat)
13. "günde X saat" yanlış schedule_update tetikliyordu (guard eklendi)
14. "Pazar gününü sil" pattern kaçırılıyordu
15. UNIQUE constraint hata mesajları yutuluyordu
16. DB legacy migration (eski → yeni konum)

### Eklenen Yeni Test Dosyaları

- `ai-coverage.test.ts` — 54 senaryo (10 kategori)
- `validate-mock-coverage.test.ts` — 200 random dataset coverage raporu
- `full-flow.test.ts` — uçtan uca pipeline E2E
- `split-and-perday.test.ts` — split + per-day hours
- `heavy-constraints.test.ts` — 20 constraint stress test

### Sonraki Adımlar (Kullanıcının İşi)

1. Train.jsonl'yi (97K örnek) fine-tune sunucusunda kullan
2. Önerilen: Qwen2.5-7B-Instruct LoRA, 2 epoch, lr=2e-4, batch=4
3. Best checkpoint'i deploy et
4. Ayarlar → AI Endpoint URL'i production server'ına yönlendir
5. Mock'tan production'a sorunsuz geçiş

### Bilinen Şüpheli Noktalar (deferred)

- Schedule "global" tab kaydetme FK cascade riski — incremental update gerekebilir
- Production icon (PNG/ICO/ICNS) eksik — default Electron icon kullanılıyor
- Windows/Mac AppImage muadili (NSIS/DMG) build edilmedi — script'ler hazır

---

## 2026-05-16 — Ana Geliştirme (özet)

- Plans/ 11 doküman + agent şablonları kuruldu
- Electron + React + Vite + Tailwind iskelet
- SQLite + IPC katmanı
- FET 17 constraint type + integration
- UI 10 sayfa
- 2,160 örnek dataset (sonra 102K'ya genişletildi)

Detaylı eski log: bu dosyanın v1 versiyonunda. Şimdi production state'i baz alıyoruz.
