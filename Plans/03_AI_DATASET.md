# AI Dataset Stratejisi

## Amaç

Local LLM'i fine-tune etmek için Türkçe doğal dil → JSON constraint eşleştirmesi içeren bir dataset hazırlamak. Hedef: **en az 1500 örnek, ideal 3000+**.

## Format

JSONL (her satır bir örnek), `Plans/dataset_samples/{constraint_type}.jsonl` dosyalarında.

```jsonl
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"Ahmet hoca cuma 2. ve 5. derslerde olmasın"},{"role":"assistant","content":"{\"constraints\":[{\"type\":\"TEACHER_NOT_AVAILABLE\",\"weight\":100,\"active\":true,\"params\":{\"teacher\":\"Ahmet\",\"slots\":[{\"day\":\"Cuma\",\"hour\":2},{\"day\":\"Cuma\",\"hour\":5}]}}],\"confidence\":0.95,\"explanation\":\"Ahmet öğretmeninin Cuma günü 2. ve 5. derslerinde mevcut olmaması kısıtlaması eklendi.\",\"warnings\":[],\"unresolved\":[]}"}]}
```

## Örnek Kategorileri ve Hedef Sayılar

| Kategori | Hedef Örnek | Zorluk |
|---|---|---|
| TEACHER_NOT_AVAILABLE | 250 | Düşük (en yaygın) |
| CLASS_NOT_AVAILABLE | 150 | Düşük |
| SUBJECT_NOT_ON_DAY | 200 | Orta |
| TEACHER_MAX_HOURS_DAILY | 100 | Düşük |
| TEACHER_MAX_DAYS_PER_WEEK | 100 | Düşük |
| TEACHER_MAX_GAPS_PER_DAY | 80 | Orta |
| TEACHER_MAX_GAPS_PER_WEEK | 80 | Orta |
| CLASS_MAX_GAPS_PER_WEEK | 80 | Orta |
| SUBJECT_PREFERRED_HOURS | 150 | Orta |
| SUBJECT_LAST_HOUR_OF_DAY | 80 | Düşük |
| SUBJECT_MAX_HOURS_DAILY | 100 | Düşük |
| SUBJECT_CONSECUTIVE_HOURS | 80 | Orta |
| ROOM_NOT_AVAILABLE | 80 | Düşük |
| SUBJECT_PREFERRED_ROOM | 100 | Düşük |
| TEACHER_HOME_ROOM | 60 | Düşük |
| CLASS_HOME_ROOM | 60 | Düşük |
| **Kombinasyon** (multi-constraint) | 200 | Yüksek |
| **Belirsizlik** (warnings/unresolved döner) | 150 | Yüksek |
| **Queries (kind:"query" / "tool_call" / "schedule_update")** | 200 | Orta |
| **TOPLAM** | **~2300** | |

## Queries Kategorisi (agentic mode)

`Plans/dataset_samples/queries.jsonl` — kullanıcının soru sorduğu, AI'nın
veritabanından bilgi çekmesi gereken veya program ayarı değiştirmek istediği
örnekler. Üç alt tür:

| Alt tür | Örnek user prompt | Beklenen response.kind |
|---|---|---|
| Öğretmen / Sınıf / Branş sorgusu | "Ahmet hangi derslere giriyor?" | `tool_call` → `query` |
| Kısıtlama / Ayar sorgusu | "Kaç kısıtlama var?" / "Günde kaç ders?" | `tool_call` → `query` |
| Belirsizlik / netleştirme | "Ahmet kaç saat?" (2 Ahmet varsa) | `query` (clarify) |
| Program iskelet değişikliği | "Teneffüsleri 20 dk uzat" | `schedule_update` |
| Gün ekle / çıkar | "Cuma'ya 1 saat ekle" | `schedule_update` |

Bu kategori için max 3 tool iterasyonu (`MAX_TOOL_ITERATIONS`) — sonsuz döngü
engeli. Dataset üretim script'i `queries.jsonl` içine hem tek-tur tool_call örnekleri
hem de "tool sonucu hazır" sayılarak doğrudan query örnekleri ekler.

## Varyasyon Boyutları

Her kategori için aşağıdaki boyutlarda varyasyon üretilir:

1. **İsim formatı:** "Ahmet hoca", "Ahmet Bey", "Ahmet Yılmaz", "Ahmet öğretmen", "Ahmet"
2. **Gün ifadesi:** "Cuma", "cuma günü", "haftanın son günü", "5. gün"
3. **Saat ifadesi:** "2. ders", "ikinci saat", "saat 2", "öğleden önce 2. ders", "ilk derslerde"
4. **Sınıf formatı:** "10F", "10/F", "10-F", "onuncu sınıf F şubesi"
5. **Cümle yapısı:** Pasif/aktif, devrik/düz
6. **Negation:** "olmasın", "yapmasın", "girmesin", "verilmesin", "olmaması lazım", "müsait değil"
7. **Yumuşaklık:** "kesinlikle olmasın" (weight 100), "olmasa iyi olur" (80), "tercih ederim" (60)
8. **Eksiklik:** Bazı örneklerde gün belirtilmemiş ("Matematik sabah olsun") → tüm günler implied

## Üretim Stratejisi (Agent'lerle)

### Faz 1: Şablon-tabanlı üretim
Her constraint tipi için Python script bir template + slot replacement ile **temel** örnekleri üretir (yaklaşık 1000 örnek).

```python
TEACHERS = ["Ahmet", "Mehmet", "Ayşe", "Fatma", "Ali", "Veli", "Zeynep", ...]  # 50+ Türk ismi
DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]
TEMPLATES = [
  "{teacher} hoca {day} {hour}. derste olmasın",
  "{teacher} öğretmen {day} günü {hour}. ders yok",
  "{day} günü {hour}. ders saatinde {teacher} müsait değil",
  ...
]
```

### Faz 2: Agent'lerle yaratıcı varyasyon
Faz 1'den çıkan temel örneklere **agent'ler** yaratıcı varyasyon ekler:
- Devrik cümleler
- Konuşma dili ("Ahmet hoca cuma yok gardaş")
- Bağlam içeren cümleler ("Ahmet hocanın çocuğu var biliyorsun, cuma erken çıkması lazım")
- Çok kısıtlamalı cümleler ("Ahmet ve Mehmet cuma yok, ayrıca Ayşe cuma 2'den sonra olsun")

### Faz 3: Adversarial / belirsizlik
Agent'ler bilerek **eksik veya muğlak** örnekler üretir:
- "Ahmet yok" → hangi gün? → warnings: ["gün belirtilmemiş"]
- Birden fazla "Ahmet" varsa → unresolved: ["Ahmet" eşleştirilemiyor]
- Çelişen kısıtlamalar → uyarı

### Faz 4: Real-world örnekler
Müdür yardımcılarından gerçek talep listeleri toplanır (eğer mümkünse). Bunlar fine-tuning'in son safhasında "altın standart" olarak eklenir.

## Context Injection

Her örnekte system prompt'a okul context'i enjekte edilir:
```
TEACHERS: ["Ahmet Yılmaz", "Ayşe Demir", ...]
CLASSES: ["9A","9B","10F", ...]
SUBJECTS: ["Matematik","Fizik", ...]
ROOMS: ["101","102","Lab1", ...]
DAYS: ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma"]
HOURS_PER_DAY: 8
```

Bu sayede model isim eşleştirmesi yapabiliyor: "Ahmet hoca" derse context'te tek bir Ahmet varsa onu seçer, iki tane varsa `unresolved` döner.

## Kalite Kontrolü

Her örnek üretildikten sonra:
1. **JSON validation** (Zod schema'ya uyuyor mu?)
2. **Round-trip test** (JSON → FET XML üretilebiliyor mu?)
3. **Smoke test** (FET XML'i fet-cl'e versek hata vermez mi?)
4. **Manuel inceleme** (örnek %5'lik random sample insan tarafından okunur)

## Dosya Organizasyonu

```
Plans/dataset_samples/
├── README.md
├── system_prompt.txt          # her örnek için aynı system mesajı
├── teacher_not_available.jsonl
├── class_not_available.jsonl
├── subject_not_on_day.jsonl
├── teacher_max_hours_daily.jsonl
├── ...
├── combinations.jsonl         # birden fazla constraint
├── ambiguous.jsonl            # warnings/unresolved döner
├── queries.jsonl              # agentic mode: query / tool_call / schedule_update
└── train_test_split/
    ├── train.jsonl            # %85
    └── eval.jsonl             # %15
```

## Fine-tuning Önerileri

(Kullanıcının kendi sunucusunda yapacağı, bilgi amaçlı)

- **Base model adayları:** Trendyol/Trendyol-LLM-7b-chat, ytu-ce-cosmos/Turkish-Llama-8b, Qwen2.5-7B-Instruct (Türkçe iyi), Qwen3-4B-instruct (küçük donanım için)
- **LoRA fine-tuning:** Her parametreyi güncellemek yerine LoRA adapter — GPU memory tasarrufu
- **Hyperparams (başlangıç önerisi):** lr=2e-4, batch=4, epochs=3, max_seq_len=2048
- **Eval metric:** JSON schema validity rate + exact match rate + semantic equivalence (constraint type doğru mu?)

## İlgili

- [04_AI_SYSTEM_PROMPT.md](04_AI_SYSTEM_PROMPT.md) — System prompt
- [05_OUTPUT_SCHEMA.md](05_OUTPUT_SCHEMA.md) — Output schema
- [agents/](agents/) — Üretim agent şablonları
