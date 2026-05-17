# Frontend UI — FİNAL DURUM

## Layout: AI panel **sağda**, Cursor benzeri

```
┌──────────────────────────────────────────────────────────────────┐
│ Ders Program Oluşturucu                              [─][□][×]  │
├──────────────────────────────────────────────────────┬───────────┤
│ Başlangıç › Dersler › Sınıflar › Derslikler │Üret │  │ AI Asistan│
├──────────────────────────────────────────────────────┤  ✨        │
│                                                      │           │
│   Ana içerik (sayfa)                                 │  Sohbet   │
│                                                      │  geçmişi  │
│   - Welcome / 2 tab (AI / Manuel stepper)            │           │
│   - CRUD ekranları                                   │  ───────  │
│   - Constraints (8 preset)                           │  [Yaz...] │
│   - Timetable (PDF/Excel/HTML export)                │  [Gönder] │
│                                                      │           │
├──────────────────────────────────────────────────────┴───────────┤
│ ● FET hazır    ● AI (mock)    ÖğretimSayfam · v0.1.0             │
└──────────────────────────────────────────────────────────────────┘
```

AI paneli **420px** geniş, sol tarafında shadow-lg ile vurgu. Toggle ile collapse edilebilir.

## Sidebar Sıralaması (ana akış)

```
Birincil:  Başlangıç › Dersler › Sınıflar › Derslikler › Öğretmenler › Ders Dağılımı › Programı Üret › Program
İkincil (sağa hizalı):  Gelişmiş · Ayarlar
```

Aralarında `›` ok işaretleri ile sıra net.

## Terminoloji (önemli)

| Eski | Yeni | Anlam |
|---|---|---|
| Branşlar | **Dersler** | Matematik, Fizik vs. ders adları |
| Dersler (matris) | **Ders Dağılımı** | Sınıf × Ders saat tablosu |
| Ana Derslik | **Sabit Derslik** | Sınıfın çoğu derste oturduğu oda |

## Welcome Ekranı — 2 Tab

### Tab 1: "AI ile konuşarak (önerilen)"
- 8 tıklanabilir örnek prompt
- Tıklayınca → AI panel açılır + input dolar
- Örnekler:
  - "Ders programı oluşturalım, nereden başlayalım?"
  - "9A, 9B, 10F sınıflarını ekle"
  - "Matematik, Fizik, Türkçe derslerini ekle"
  - "Ahmet hocayı ekle, matematik veriyor, haftada 25 saat"
  - "Beden eğitimi son derste olsun"
  - "Cuma'ya 1 saat ekle"

### Tab 2: "Manuel adım adım"
6 adımlı stepper, her birinin durumu (✓ tamam / ○ bekliyor) gerçek zamanlı:
```
1. Dersler         (✓ 5 ders)
2. Sınıflar        (✓ 3 sınıf)
3. Derslikler      (✓ 4 derslik)
4. Öğretmenler     (○ henüz yok)
5. Ders Dağılımı   (○ henüz yok)
6. Programı Üret   (○)
```
Progress bar üstte: "3/5 adım tamamlandı".

## Sayfa Listesi (13)

1. **Welcome** (`/welcome`) — başlangıç wizard
2. **Subjects** (`/subjects`) — dersler (renk + kısa kod)
3. **Classes** (`/classes`) — sınıflar (virgülle çoklu giriş, "sınıf adıyla aynı derslik" radio)
4. **Rooms** (`/rooms`) — derslikler (virgülle çoklu giriş)
5. **Teachers** (`/teachers`) — öğretmenler (multi-select ders + saat)
6. **Activities** (`/activities`) — Ders Dağılımı matrisi + "Toplu Ekle" dialog
7. **Constraints** (`/constraints`) — kısıtlama listesi + 8 hazır preset
8. **Schedule** (`/schedule`) — Genel + Güne Özel tab
9. **Generate** (`/generate`) — FET çalıştır + progress + log
10. **Timetable** (`/timetable`) — sonuç görüntü (Sınıf/Öğretmen/Derslik) + PDF/Excel/HTML export
11. **Settings** (`/settings`) — AI endpoint + zaman ayarları + Hakkında
12. **Advanced** (`/advanced`) — Gün/Saat planı + Kısıtlamalar Listesi linkleri
13. **(implicit) AppShell** — layout

## AI Panel Özellikleri (sağda)

- **Sohbet geçmişi** — scroll, DB'den persist
- **Quick-start grid** (sohbet boşken): Wizard / Öğretmen ekle / Sınıf ekle / Programı üret butonları
- **Mesaj baloncukları:**
  - Kullanıcı: mavi sağ-aligned
  - Asistan: gri sol-aligned + 📋 kopyala butonu
- **Kind bazlı görsel:**
  - constraint → kategori renk rozeti (Öğretmen mor, Sınıf mavi, Ders emerald, Derslik amber, Genel slate) + "Listeye Ekle" / "Vazgeç"
  - query → mavi info card (📋 ℹ️ icon, opt. data JSON detail)
  - tool_call → gri "AI bilgi çekiyor: getTeacherActivities(...)" kompakt kutu
  - schedule_update → amber kart + "Uygula" / "İptal"
  - data_mutation → action listesi, destructive ise kırmızı uyarı, "Uygula 3 işlem" butonu
- **Toolbar:** 🧹 Mesajları Temizle (header'a, sadece mesaj varsa)
- **Input:** textarea, Enter gönderir, Shift+Enter satır, 4000 char limit + sayaç
- **Loading state:** "düşünüyor..." animasyon
- **Collapse:** sağa yatay başlık, tek tıkla geri aç

## Renk Paleti (Tailwind tokens)

```js
primary: blue 50-900
surface: 0/50/100/200/300 (white → light gray)
ink:     400/600/700/800/900 (slate)
accent:  ok=emerald, warn=amber, err=red
```

Font: **Inter** (Google Fonts).

## State Management

`zustand`:
- useSubjectsStore, useClassesStore, useRoomsStore, useTeachersStore, useActivitiesStore
- useConstraintsStore, useScheduleStore, useGenerateStore, useSettingsStore
- useAIChatStore (mesajlar + pendingPrompt + panelOpenSignal)
- useToastStore

Her store mount'ta IPC üzerinden DB'den yükler, mutation'ları DB'ye yansıtır.

## i18n

`src/lib/i18n.ts` — tüm Türkçe metinler. ~120 anahtar:
- `nav`, `common`, `welcome`, `teachers`, `subjects`, `classes`, `rooms`, `activities`
- `schedule`, `constraints`, `ai`, `generate`, `timetable`, `settings`, `status`
- `constraints.presets.*` (8 preset), `ai.quickStartPrompts` (4 quick-start)

## Responsive

- Min pencere: 1280×800 (sidebar geniş + AI panel sığsın)
- Sol AI panel collapse edilebilir (manuel)
- Tablolar yatay scroll
- Activities matrisi büyük okul için scroll

## Yeni Özellikler (son tur)

- Welcome tıklanabilir prompt'lar
- AI panel: copy / clear / quick-start / kategori rozet / tool_call sadeleştirme
- Constraints 8 preset buton (tek tıkla ekle)
- Activities "Toplu Ekle" dialog (Ders + Saat + Çoklu Sınıf)
- Classes "Sınıf adıyla aynı derslik" radio + otomatik room yaratım
- Sınıf/Derslik/Ders eklemede virgülle çoklu giriş
- Timetable PDF/Excel/HTML export
- Loading spinner + empty state hint'leri tüm sayfalarda
