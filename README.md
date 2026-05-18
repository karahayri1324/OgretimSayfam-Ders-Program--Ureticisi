<div align="center">

# 📅 Ders Program Oluşturucu

**AI destekli Türkçe ders programı üreticisi — Cursor mantığı, okul programı için.**

*ÖğretimSayfam tarafından geliştirildi.*

[![Tests](https://img.shields.io/badge/tests-110%20passing-success)](#test)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](#)
[![Electron](https://img.shields.io/badge/Electron-33-9cf)](#)
[![React](https://img.shields.io/badge/React-18-61dafb)](#)
[![FET](https://img.shields.io/badge/FET-6.8.5-orange)](https://lalescu.ro/liviu/fet/)

</div>

---

## 🎯 Nedir?

Okulların haftalık ders programını oluşturmak haftalarca süren manuel bir iştir. Bu uygulama, **doğal Türkçe ile yazdığınız kuralları otomatik olarak çözen** bir masaüstü asistanıdır.

```
"Ahmet hoca cuma 2. ve 5. derslerde olmasın"
    ↓ AI çevirir
TEACHER_NOT_AVAILABLE { teacher: "Ahmet Yılmaz", slots: [...] }
    ↓ FET çözücü
✓ Optimal program — saniyeler içinde
```

Kullanıcı manuel UI'da yapabildiği **her şeyi** AI'a da yaptırabilir: kısıtlama ekle, sınıf/öğretmen/derslik düzenle, slot kilitle, dersleri yer değiştir, programı üret, PDF/Excel olarak indir.

---

## ✨ Öne Çıkan Özellikler

### 🤖 AI Asistan (Cursor Tarzı)
- **Sol panel** sürekli açık — istediğin zaman yazıp soru sor veya komut ver
- **Türkçe doğal dil**: "Beden son derste olsun", "9A pzt 8 ders alsın", "Mehmet'in programını göster"
- **Disambiguation**: İki Ahmet varsa "Hangisi? Ahmet Yılmaz mı Ahmet Demir mi?" diye sorar
- **Out-of-scope refusal**: Domain dışı taleplerde sınırını söyler ve yapabildiklerini listeler
- **Multi-step planlama**: Karmaşık istekleri parçalara böler, iteratif tool çağrılarıyla ilerler
- **Onay akışı**: Yıkıcı işlemler her zaman onay ister (silme, swap, kilit)

### ⚡ FET 6.8.5 Çözücü
- Endüstri standardı, açık kaynak çözücü (subprocess olarak çağrılır)
- **60+ kısıtlama tipi**: öğretmen müsaitliği, sınıf boşlukları, branş tercihleri, derslik kullanımı, bina geçişleri, vb.
- Tipik okul (~50 öğretmen × ~20 sınıf): **<1 saniye** çözüm
- Çözüm bulamazsa kısıtlamaları gevşetme önerisi (`constraint_relax`)

### 📊 Üç Görünüm + Export
- Sınıf bazlı, öğretmen bazlı, derslik bazlı haftalık tablo
- Slot bazlı manuel düzenleme (sürükle-bırak yakında)
- Lock/Unlock: bir slot'u sabitleyip yeniden üretimde değiştirme
- **Export**: PDF, Excel (.xlsx), HTML (yazdırılabilir)

### 🔒 Güvenlik & Veri
- **Tüm veri yerel** — SQLite ile cihazda kalır, bulut yok
- **AI modeli kullanıcı sunucusunda** — telemetri/dış servis bağımlılığı yok
- SQL injection güvenli (prepared statements), Zod input validation
- Destructive işlemler her zaman onaylı

---

## 🧱 Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Renderer (React)                │
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │   AI Panel   │  │   Sayfa İçeriği                    │   │
│  │  (sol, ~30%) │  │   (Sınıflar, Öğretmenler,          │   │
│  │              │  │    Program Üret, Timetable, vb)    │   │
│  │ Türkçe chat  │  │                                    │   │
│  │ + onay kartı │  │                                    │   │
│  └──────┬───────┘  └────────────────┬───────────────────┘   │
└─────────┼───────────────────────────┼───────────────────────┘
          │ IPC                       │ IPC
┌─────────▼───────────────────────────▼───────────────────────┐
│                   Electron Main Process                     │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│   │ AI Client    │  │ Mutation     │  │ FET Runner      │   │
│   │ (HTTP→LLM)   │  │ Executor     │  │ (child_process) │   │
│   │              │  │ (39 op)      │  │                 │   │
│   └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│          │                 │                   │            │
│          ▼                 ▼                   ▼            │
│   ┌──────────────────────────────────────────────────────┐  │
│   │            SQLite (better-sqlite3)                   │  │
│   │   teachers, classes, subjects, rooms, activities,    │  │
│   │   constraints, schedule, ai_messages, ...            │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│       Local LLM Server (kullanıcı sunucusunda)              │
│       Qwen3-30B-A3B + LoRA (Türkçe fine-tuned)                 │
│       HTTP endpoint — sadece bu uygulamadan istek alır      │
└─────────────────────────────────────────────────────────────┘
```

### Bileşenler

| Katman | Teknoloji | Görev |
|---|---|---|
| UI | React 18 + Vite + TailwindCSS | Cursor benzeri UX, sol AI paneli |
| Routing | React Router | Sayfa geçişleri |
| State | Zustand | Hafif, type-safe store |
| Validation | Zod | IPC sınırında schema |
| DB | better-sqlite3 | Synchronous, prepared statement |
| Çözücü | FET 6.8.5 | AGPL binary, subprocess (linklenmiyor) |
| XML | xmlbuilder2 / fast-xml-parser | FET XML build & parse |
| Export | xlsx, native HTML | PDF/Excel/HTML çıktı |
| LLM | Fine-tuned model | HTTP üzerinden Türkçe komut→JSON |

---

## 🚀 Kurulum

### Geliştirme

```bash
git clone <repo-url>
cd ÖğretimSayfamDersProgramıÜreticisi
npm install
npm run dev
```

Uygulama açılır, hot-reload aktif. FET binary `resources/bin/<platform>/fet-cl` içinde paketlenmiştir.

### Production Build

```bash
npm run build:linux    # AppImage (~120MB, FET dahil)
npm run build:win      # NSIS installer
npm run build:mac      # DMG
```

Çıktılar `release/` klasörüne yazılır.

### LLM Sunucusu

Uygulamanın AI özellikleri için fine-tuned bir LLM gereklidir. Detaylar: [`Plans/04_AI_SYSTEM_PROMPT.md`](Plans/04_AI_SYSTEM_PROMPT.md).

Konfigürasyon: Ayarlar sayfasından LLM endpoint URL'si girilir (örn. `http://localhost:8000/v1/chat/completions`).

---

## 🧪 Test & Kalite

```bash
npm test           # 110 test (vitest)
npm run typecheck  # TypeScript strict
npm run lint       # ESLint v9 flat config
```

**Kapsama:**
- FET XML round-trip (build → fet-cl → parse → constraint validation)
- AI agentic loop (multi-turn tool calling)
- 60+ FET constraint handler (heavy-constraints test, scale test 54 öğretmen × 18 sınıf @ 0.1s)
- Mock LLM server (production öncesi geliştirme için)
- Dataset schema validation
- Edge case'ler: split activities, per-day hours, building changes

---

## 📚 AI Dataset

Modeli fine-tune etmek için Türkçe odaklı bir dataset üretiliyor:

- **~200K örnek** (87 generator kategorisi)
- Tüm FET kısıtlama tipleri + UI action'ları + ambiguous case'ler
- Disambiguation, out-of-scope refusal, multi-step planning örnekleri
- 4-10 saat / 4-6 gün varyasyonu, dengeli kategori dağılımı (≤2:1 oran)

Dataset üretimi:
```bash
python3 scripts/generate_dataset.py
# Çıktı: Plans/dataset_samples/*.jsonl (~2.7GB)
```

Schema doğrulaması:
```bash
npx tsx scripts/validate_dataset.ts          # Zod schema check
npx tsx scripts/round_trip_validation.ts 20  # FET XML round-trip
```

---

## 📁 Proje Yapısı

```
.
├── electron/              # Electron main process
│   ├── ai/                # LLM client, mutation executor, mock server
│   ├── db/                # SQLite + repository pattern
│   ├── fet/               # XML builder/parser + 60 constraint handler
│   ├── ipc/               # IPC channel definitions (Zod validated)
│   └── main.ts
├── src/                   # Renderer (React)
│   ├── components/        # UI kütüphanesi, AIPanel, Sidebar
│   ├── pages/             # Sayfalar (Schedule, Activities, Generate, Timetable)
│   ├── store/             # Zustand stores
│   ├── lib/               # i18n, types, helpers
│   └── App.tsx
├── scripts/               # Dataset üretimi, validation
├── test/                  # Vitest test dosyaları
├── Plans/                 # Tasarım belgeleri (architecture, schema, AI prompt)
├── resources/bin/         # FET binary'leri (platform başına)
└── release/               # Build çıktıları (gitignored)
```

Detaylı tasarım belgeleri: [`Plans/`](Plans/) klasörü.

---

## 🛣️ Yol Haritası

- [x] **M0–M4**: Iskelet, FET entegrasyonu, UI temelleri
- [x] **M5**: AI panel + mock server, 60 constraint handler
- [x] **M6**: Capability parity (manual'da yapılan = AI'da yapılabilir)
- [x] **M7**: Test kapsama (110 test), TS strict, ESLint
- [x] **M8**: AppImage paketleme, FET binary bundling
- [x] **M9**: Disambiguation + out-of-scope + multi-step planning davranışları
- [ ] **M10**: Local LLM fine-tune (Qwen3-30B-A3B + LoRA)
- [ ] **M11**: Drag-and-drop slot editing
- [ ] **M12**: Multi-user / cloud sync (opsiyonel)

---

## ⚙️ Tekno Detaylar

### FET Lisans Stratejisi
FET (AGPLv3) **subprocess olarak çağrılır**, uygulamaya linklenmez. Bu sayede AGPL bulaşması olmaz, paket halinde dağıtım serbest. Detay: [`Plans/02_FET_INTEGRATION.md`](Plans/02_FET_INTEGRATION.md).

### AI Yetenek Listesi
- **39 mutation operasyonu** (CRUD: teacher/subject/class/room/activity, slot lock/swap/set, split/merge, constraint add/delete/weight, settings, export, navigate, run_solver)
- **23 read-only tool** (Türkçe deburred fuzzy matching ile sorgu)
- **60+ FET kısıtlama tipi** desteklenir

### Performans
- **Scale test**: 54 öğretmen + 684 slot → 0.1s çözüm
- **Heavy constraints test**: 20 farklı kısıtlama + 8 sınıf → 0.22s
- **Dataset üretimi**: SCALE=22 ile ~5dk (~197K satır)

---

## 📜 Lisans

- **Kaynak kod**: Kapalı kaynak — © ÖğretimSayfam
- **FET çözücü**: [GNU AGPLv3](https://lalescu.ro/liviu/fet/) — subprocess çağrı, redistribution serbest
- **Üçüncü taraf kütüphaneler**: `node_modules/<paket>/LICENSE`

---

## 📞 İletişim

**ÖğretimSayfam**  
📧 [iletisim@ogretimsayfam.com](mailto:iletisim@ogretimsayfam.com)

Hata raporu veya öneri için issue açabilirsin.

---

<div align="center">

*Made with ❤️ in Türkiye*

</div>
