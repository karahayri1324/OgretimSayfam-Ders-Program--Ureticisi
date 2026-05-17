# Ders Program Oluşturucu — Genel Bakış

**Şirket:** ÖğretimSayfam
**Ürün:** Ders Program Oluşturucu
**Versiyon:** 0.1.0 (geliştirme)
**Lisans:** Kapalı kaynak (FET subprocess olarak çağrılıyor, AGPL bulaşması yok)

## Tek cümlede

Müdür yardımcısı doğal Türkçe ile kısıtlama yazar ("Ahmet hoca cuma 2. ve 5. derslerde olmasın"), AI bunu FET kısıtlama JSON'una çevirir, FET algoritması ders programını üretir, Electron app gösterir.

## Niye Var?

FET dünyanın en güçlü açık kaynak timetabling çözücülerinden biri. Ama:
- UI'sı 90'lar tadında, karmaşık
- 100+ kısıtlama tipi var, normal kullanıcı için ezoterik
- XML editleme gerektirir, müdür yardımcısı yapmaz

**Bizim çözümümüz:** FET'i motor olarak kullan, üstüne Cursor-benzeri sade bir UX + doğal dil arayüzü koy.

## Ana Bileşenler

1. **Manuel Veri Girişi:** Öğretmenler, sınıflar, derslikler, branşlar, dersler, gün/saat planı.
2. **AI Kısıtlama Paneli:** Sol tarafta chat (Cursor stili). Kullanıcı yazar → AI JSON kısıtlama döner → kullanıcı onaylar → kısıtlama listesine eklenir.
3. **FET Motoru:** Subprocess olarak `fet-cl` çağrılır. Tüm veri XML'e dönüşür, çözülür, çıkan timetable parse edilir.
4. **Program Görüntüleyici:** Tablo formatında (gün × saat ızgarası) sınıf bazlı / öğretmen bazlı / derslik bazlı görüntü.
5. **Export:** PDF, Excel, HTML.

## Çalışma Akışı (User Journey)

```
1. Yeni Program Oluştur
2. Okul ayarları: 5 gün, günde 8 saat, vs.
3. Branş ekle: Matematik, Fizik, Türkçe, ...
4. Öğretmen ekle: Ahmet (Matematik, hafta 25 saat), Ayşe (Fizik, 20 saat), ...
5. Sınıf ekle: 9A, 9B, 10A, ... (her sınıfın hangi dersten kaç saat aldığı)
6. Derslik ekle: 101, 102, Laboratuvar 1, ...
7. Doğal dil kısıtlamaları yaz: "Ahmet hoca cuma günü yok", "Beden eğitimi son derste olsun"
8. "Programı Üret" → fet-cl çalışır → 1-30sn sonra timetable hazır
9. Tablo görüntüsünde incele → memnun değilsen yeni kısıtlama ekle → tekrar üret
10. PDF olarak indir
```

## Performans Hedefleri

- **Küçük okul (15 öğretmen, 10 sınıf):** 2-5 saniye çözüm
- **Orta okul (50 öğretmen, 30 sınıf):** 10-60 saniye çözüm
- **Büyük lise (100+ öğretmen, 50+ sınıf):** 2-10 dakika çözüm
- **App startup:** <1 saniye
- **AI yanıt süresi:** <2 saniye (LLM'ye bağlı)

## Risk Listesi

| Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|
| FET çözüm bulamayabilir (over-constrained) | Yüksek | Yüksek | Kısıtlama weight'leri ayarlanabilir + "soft constraint" modu |
| AI yanlış JSON üretebilir | Orta | Orta | Schema validation + kullanıcı onayı |
| Local LLM yavaş olabilir | Orta | Düşük | Loading state + timeout + retry |
| FET binary bundle sorunları | Düşük | Yüksek | electron-builder hooks + platform testleri |
| Türkçe karakter encoding | Orta | Orta | UTF-8 her yerde, FET dosyalarında encoding="UTF-8" |

## İlgili Dokümanlar

- [01_ARCHITECTURE.md](01_ARCHITECTURE.md) — Sistem mimarisi
- [02_FET_INTEGRATION.md](02_FET_INTEGRATION.md) — FET ile entegrasyon
- [03_AI_DATASET.md](03_AI_DATASET.md) — AI dataset stratejisi
- [09_MILESTONES.md](09_MILESTONES.md) — Geliştirme fazları
