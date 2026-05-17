# Dataset Generator Agent Şablonu

## Amaç

Türkçe doğal dil → AI response JSON eşleştirmesi içeren JSONL örnekleri üretmek.

## Agent Çağrı Şablonu

```
description: Generate TR dataset for {constraint_type}
subagent_type: general-purpose
prompt: |
  Sen bir veri kümesi üretme asistansın. Görevin: "{constraint_type}" tipi
  FET kısıtlaması için Türkçe doğal dil → JSON eşleştirmeleri üretmek.

  ## Context
  Bu, bir AI fine-tuning dataset'i. Local LLM, Türkçe yazılmış müdür
  yardımcısı talebini alıp yapılandırılmış JSON döndürecek. Sen bunun
  için training data hazırlıyorsun.

  ## Output Schema (AI'ın döndüreceği şey)
  {
    "constraints": [{
      "type": "{constraint_type}",
      "weight": 0-100,
      "active": true,
      "params": { ... }
    }],
    "confidence": 0-1,
    "explanation": "Türkçe",
    "warnings": [],
    "unresolved": []
  }

  ## Schema referansı
  Plans/05_OUTPUT_SCHEMA.md dosyasını oku, "{constraint_type}" bölümünü
  bul, params yapısını öğren.

  ## Üretim kuralları
  1. Toplam {N} farklı örnek üret
  2. İsim varyasyonları kullan (Plans/dataset_samples/names.txt'den)
  3. Cümle yapısı çeşitliliği:
     - Düz cümle: "Ahmet hoca cuma yok"
     - Devrik: "Cuma günü Ahmet hoca müsait değil"
     - Konuşma dili: "Ahmet hocayı cumaya koyma kanka"
     - Resmi: "Ahmet Yılmaz öğretmen Cuma günü mevcut bulunmamaktadır"
  4. Weight çeşitliliği:
     - Sert: "olmasın", "yasak" → weight: 100
     - Orta: "olmasa iyi olur" → weight: 80
     - Yumuşak: "mümkünse olmasın" → weight: 60
  5. Context block: her örnek için makul bir okul verisi inject et
  6. %10 oranında belirsiz veya hatalı örnek üret (warnings/unresolved'lı)

  ## Format
  Her satırda bir JSON object (JSONL formatı):
  {"messages":[
    {"role":"system","content":"<system_prompt — Plans/04'ten al, kısalt>"},
    {"role":"user","content":"[CONTEXT]\n...\n[/CONTEXT]\n\n[USER_REQUEST]\nAhmet hoca cuma yok\n[/USER_REQUEST]"},
    {"role":"assistant","content":"<JSON yanıt>"}
  ]}

  ## Çıktı
  Şu dosyaya yaz: Plans/dataset_samples/{constraint_type}.jsonl

  ## Kalite Kontrolü
  Üretmeden önce ilk 3 örneği bana göster, onay aldıktan sonra geri kalanı
  üret. Tüm JSON'ların geçerli olduğundan emin ol (kendi içinde JSON.parse
  testi yap).

  Raporla: toplam kaç örnek üretildi, varyasyon dağılımı, kalite notları.
```

## Constraint Tiplerine Göre Hedef Sayılar

(Plans/03_AI_DATASET.md'den)

| Type | N |
|---|---|
| TEACHER_NOT_AVAILABLE | 250 |
| CLASS_NOT_AVAILABLE | 150 |
| SUBJECT_NOT_ON_DAY | 200 |
| TEACHER_MAX_HOURS_DAILY | 100 |
| TEACHER_MAX_DAYS_PER_WEEK | 100 |
| ... | ... |

## Paralel Çalıştırma

5-7 agent'i paralel çağırarak (tek mesajda birden fazla Agent tool use)
farklı constraint tipleri eş zamanlı üretilir.

## Doğrulama Sonrası

Tüm JSONL'ler üretildikten sonra `scripts/validate_dataset.ts` ile
otomatik doğrulama. Sorunlu satırlar `errors.jsonl`'a ayrıştırılır.
