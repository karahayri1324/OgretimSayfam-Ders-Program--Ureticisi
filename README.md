# Ders Program Oluşturucu

ÖğretimSayfam tarafından geliştirilen, **AI destekli** Türkçe ders programı üreticisi.

Doğal Türkçe ile yazın, AI sizin için programı şekillendirsin. Cursor mantığı, ders programı için.

> **"Ahmet hoca cuma 2. ve 5. derslerde olmasın"** → AI çevirir → FET çözer → program hazır.

## Özellikler

- 🎯 **Sade arayüz** — Cursor benzeri sol AI paneli + sağ ana içerik
- 🇹🇷 **Tam Türkçe** — UI, AI, raporlar, hata mesajları
- 🤖 **Doğal dil kısıtlama** — "Beden eğitimi son derste olsun" → otomatik kısıtlama
- ⚡ **Hızlı çözücü** — FET 6.8.5 motoru, dakikalar yerine saniyeler
- 📦 **Tek kurulum** — FET binary'si paketin içinde, ek kurulum yok
- 📊 **Çoklu görünüm** — Sınıf bazlı, öğretmen bazlı, derslik bazlı
- 📤 **Export** — PDF, Excel, HTML

## Kurulum (Geliştirici)

```bash
npm install
npm run dev
```

## Build

```bash
npm run build:linux    # AppImage
npm run build:win      # NSIS .exe
npm run build:mac      # .dmg
```

## Mimari

- **Electron** masaüstü kabuğu
- **React + Vite + TailwindCSS** UI
- **SQLite (better-sqlite3)** yerel veri
- **FET 6.8.5** çözücü motoru (subprocess)
- **Local LLM** (kullanıcı sunucusunda) kısıtlama ayrıştırma

Detaylı dokümantasyon: [`Plans/`](Plans/) klasörü.

## Lisanslar

- Bu uygulamanın kaynak kodu kapalı kaynaktır
- [FET](https://lalescu.ro/liviu/fet/) — GNU AGPLv3, ayrı binary olarak çağrılır
- Tüm kütüphane lisansları `node_modules/`'da

## İletişim

ÖğretimSayfam — iletisim@ogretimsayfam.com
