# Inference Contract — Serving Katmanı Sözleşmesi

> **DEPLOYMENT-KRİTİK.** Uygulama (Electron) fine-tuned modele **doğrudan** istek atmaz;
> arada bir **serving (proxy) katmanı** vardır. Bu katman, app'ten gelen ham payload'ı
> **modelin eğitildiği mesaj formatına** çevirmek **ZORUNDADIR**. Format en ufak saparsa
> model dağıtım-dışı (OOD) girdi alır ve kalite çöker. Bu dosya o çeviriyi birebir tanımlar.

---

## 1. App ne gönderiyor?

`electron/ai/client.ts` → `POST <endpoint>` (Content-Type: application/json):

```jsonc
{
  "text": "11C ilk derse girmesin",          // ham kullanıcı isteği
  "context": {                                  // okul durumu (buildAIContext)
    "teachers": ["Ahmet Yılmaz", ...],
    "classes":  ["9A", "10B", ...],
    "subjects": ["Matematik", ...],
    "rooms":    ["201", "Fizik Lab", ...],
    "days":     ["Pazartesi", ..., "Cuma"],
    "hoursPerDay": 8,
    "constraints": [                            // MEVCUT aktif kısıtlamalar
      { "id": 1, "type": "TEACHER_NOT_AVAILABLE", "weight": 100,
        "active": true, "description": "ahmet yılmaz teacher not available" }
    ]
  },
  "history": [                                  // önceki konuşma turları (varsa)
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "{...json...}" }
  ],
  "toolHistory": [                              // bu istekte çalıştırılan tool'lar
    { "role": "tool", "tool": "getTeacherTimetable",
      "args": { "teacher": "Ahmet Yılmaz" },
      "result": { "...": "..." },
      "reasoning": "modelin ilk tur tool_call cevabındaki reasoning metni" }
  ],
  "noMoreTools": false                          // true ise: bu turda tool_call ÜRETME
}
```

App, modelin yanıtını HTTP gövdesinde **JSON nesnesi veya ham metin** olarak bekler
(`coerceJson` markdown fence'i soyar ve ilk `{`..son `}` arasını ayrıştırır; yine de
**düz JSON nesnesi döndürmek en güvenlisidir**).

---

## 2. Serving katmanı ne YAPMALI? (mesaj inşası)

Modelin eğitildiği format (bkz. `scripts/generate_dataset.py`, `Plans/dataset_samples/`):
OpenAI `messages` dizisi. Sıra ve biçim **birebir** şöyle olmalı:

### 2.1. system mesajı (ZORUNLU, byte-eş)
`Plans/dataset_samples/system_prompt.txt` dosyasının **`.strip()`'lenmiş** içeriği.
Eğitimdeki system mesajı bununla **byte-eş**tir (`generate_dataset.py:31` → `.read_text().strip()`).
Trailing newline dahil hiçbir fark olmamalı. **Drift olmasın diye checksum doğrula**
(`test/inference-contract.test.ts` bu eşliği kontrol eder).

### 2.2. (varsa) history turları
`history` dizisindeki her öğe `{role, content:text}` olarak eklenir (sırasıyla).
Not: dataset ağırlıklı tek-istek; çoklu-istek geçmişi sınırlı temsil edilir.

### 2.3. ilk user mesajı (ZORUNLU — CONTEXT + USER_REQUEST)
`context` objesi **tam şu alan sırasıyla** string'e çevrilir:

```
[CONTEXT]
TEACHERS: <json>
CLASSES: <json>
SUBJECTS: <json>
ROOMS: <json>
DAYS: <json>
HOURS_PER_DAY: <int>
CONSTRAINTS: <json>
[/CONTEXT]

[USER_REQUEST]
<text>
[/USER_REQUEST]
```

- `<json>` = `json.dumps(liste, ensure_ascii=False)` (Türkçe karakter KORUNUR).
- `CONSTRAINTS` boşsa `[]` basılır. **Bu alan eğitimde de var** — atlanırsa OOD olur.

### 2.4. tool turları (`toolHistory` doluysa — multi-turn)
Her `toolHistory[i]` için **iki mesaj** eklenir:

1. **assistant** — tool çağrısını yeniden kur (eğitimle birebir **4 anahtar**,
   sırasıyla `kind, tool, args, reasoning`):
   ```json
   {"kind":"tool_call","tool":"<tool>","args":<args>,"reasoning":"<reasoning>"}
   ```
   > `reasoning` eğitimde HER tool_call'da vardır (`generate_dataset.py:_tool_call`).
   > App, ilk tur tool_call cevabındaki reasoning'i `toolHistory[i].reasoning` ile
   > geri gönderir; serving onu aynen koyar. Atlanırsa 3-anahtarlı obje OOD olur.
2. **user** — tool sonucu, eğitimdeki `[TOOL_RESULT]` sarmalıyla:
   ```
   [TOOL_RESULT]
   tool: <tool>
   args: <json args>
   result: <json result>
   [/TOOL_RESULT]
   ```

> Bu sıra (assistant tool_call → user [TOOL_RESULT]) eğitimle **birebir** aynıdır
> (`gen_multi_turn_query` / `gen_multi_turn_planning`). Model böylece "tool sonucu
> geldikten sonra nihai cevabı üret" davranışını öğrenmiş olarak doğru tepki verir.

### 2.5. noMoreTools = true ise
Son tool turundayız; modelin tekrar `tool_call` üretmesini engellemek için system
mesajının **sonuna** şu talimatı ekle:

```
[SON TUR] Bu turda tool_call ÜRETME. Eldeki bilgiyle nihai cevabı (query / data_mutation
/ constraint / schedule_update / run_solver) döndür.
```

---

## 3. Referans serving adaptörü (Python / FastAPI iskeleti)

```python
SYSTEM_PROMPT = open("system_prompt.txt", encoding="utf-8").read().strip()

def build_messages(payload: dict) -> list[dict]:
    sys = SYSTEM_PROMPT
    if payload.get("noMoreTools"):
        sys += ("\n\n[SON TUR] Bu turda tool_call ÜRETME. Eldeki bilgiyle nihai cevabı "
                "(query / data_mutation / constraint / schedule_update / run_solver) döndür.")
    msgs = [{"role": "system", "content": sys}]

    for h in payload.get("history", []):
        msgs.append({"role": h["role"], "content": h["text"]})

    c = payload["context"]
    def j(x): return json.dumps(x, ensure_ascii=False)
    ctx = (f"[CONTEXT]\nTEACHERS: {j(c['teachers'])}\nCLASSES: {j(c['classes'])}\n"
           f"SUBJECTS: {j(c['subjects'])}\nROOMS: {j(c['rooms'])}\nDAYS: {j(c['days'])}\n"
           f"HOURS_PER_DAY: {c['hoursPerDay']}\nCONSTRAINTS: {j(c.get('constraints', []))}\n[/CONTEXT]")
    msgs.append({"role": "user",
                 "content": f"{ctx}\n\n[USER_REQUEST]\n{payload['text']}\n[/USER_REQUEST]"})

    for t in payload.get("toolHistory", []):
        msgs.append({"role": "assistant",
                     "content": json.dumps({"kind": "tool_call", "tool": t["tool"],
                                            "args": t["args"],
                                            "reasoning": t.get("reasoning", "")},
                                           ensure_ascii=False)})
        msgs.append({"role": "user",
                     "content": (f"[TOOL_RESULT]\ntool: {t['tool']}\nargs: {j(t['args'])}\n"
                                 f"result: {j(t['result'])}\n[/TOOL_RESULT]")})
    return msgs

# 1) build_messages(payload) → 2) chat template (Qwen3) → 3) generate
# 4) modelin ürettiği assistant metnini JSON parse et → 5) HTTP gövdesinde döndür
```

---

## 4. Yanıt (model → app)

Model **yalnızca JSON** üretmeli (system prompt bunu zorlar). Serving:
- Modelin ürettiği metni parse edip **JSON nesnesini** gövde olarak döndürür (önerilen), veya
- Ham metni döndürür — app `coerceJson` ile fence soyar/parse eder.

App tarafı `kind` alanına göre 6 tip bekler:
`constraint` (default), `query`, `tool_call`, `schedule_update`, `data_mutation`, `run_solver`.
Şema: `electron/ai/schema.ts` (`validateAIResponse`).

---

## 5. Eğitim ↔ inference senkron kontrol listesi

| Madde | Eğitim (dataset) | Inference (serving) | Kontrol |
|---|---|---|---|
| system | `system_prompt.txt`.strip() | aynı, byte-eş | checksum testi |
| CONTEXT alanları | 7 alan (CONSTRAINTS dahil), sabit sıra | aynı sıra | `test/inference-contract.test.ts` |
| USER_REQUEST | `[USER_REQUEST]...[/USER_REQUEST]` | aynı | — |
| tool sonucu | `[TOOL_RESULT]...[/TOOL_RESULT]` user turu | aynı | — |
| assistant tool_call turu | `{kind,tool,args,reasoning}` (4 anahtar) | aynı (reasoning dahil) | `test_inference_build.py` |
| op/constraint listesi | `schema.ts` ile senkron | model `schema.ts`'e uygun üretir | zod validate |

> **Model her güncellendiğinde:** system_prompt.txt değişmişse dataset'i **yeniden üret**
> (`python scripts/generate_dataset.py`) ve modeli **yeniden eğit**. Aksi halde serving'in
> gönderdiği system ile modelin beklediği farklılaşır.

## 6. Eğitim notu — system prompt token israfı

Her örnek ~15 KB system prompt'u tekrar eder (token'ın ~%94'ü sabit). Bu **veri**
sorunu değil, **eğitim config** konusudur: **loss yalnızca assistant token'larında**
hesaplanmalı (system + user maskelenir — axolotl `train_on_inputs: false`,
LLaMA-Factory `mask_history`/template defaults). Böylece tekrarlı system maliyeti
gradyana yansımaz; sadece modelin üreteceği çıktı öğrenilir.
