# AI Output JSON Schema

AI sunucusunun döndüreceği JSON formatı. Bu schema **kontrat** — değişirse hem dataset hem mapper güncellenir.

## Discriminated Union (agentic mode)

AI yanıtları artık `kind` alanına göre beş farklı varianta ayrılır:

| kind | Açıklama |
|---|---|
| `constraint` | Kısıtlama önerisi (default — `kind` eksikse bu kabul edilir, backward compat) |
| `query` | Doğal dil soruya cevap |
| `tool_call` | DB'den bilgi çekmek için iteratif tool çağrısı |
| `schedule_update` | Program iskelet değişikliği (kullanıcı onayı gerekli) |
| `data_mutation` | CRUD işlem(ler)i — veri ekle/sil/güncelle (kullanıcı onayı gerekli, çoklu action) |

İmplementasyon: `electron/ai/schema.ts` (Zod), `src/lib/types.ts` (TypeScript).

### kind: "constraint" (default — Top-level Response)

```json
{
  "kind": "constraint",                    // opsiyonel
  "constraints": [ /* one or more Constraint objects */ ],
  "confidence": 0.92,
  "explanation": "Cuma günü 10F sınıfı için matematik dersini engelleyen kısıtlama oluşturuldu.",
  "warnings": [],
  "unresolved": []
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `kind` | "constraint"? | Opsiyonel — eksikse "constraint" kabul edilir |
| `constraints` | array | Üretilen kısıtlamaların listesi |
| `confidence` | float 0..1 | AI'nın güveni |
| `explanation` | string TR | Kullanıcıya gösterilecek Türkçe açıklama |
| `warnings` | string[] | Belirsiz noktalar ("Hangi 'Ahmet hoca' kastedildi belirsiz") |
| `unresolved` | string[] | Eşleştirilemeyen referanslar |

### kind: "query"

```json
{
  "kind": "query",
  "answer": "Ahmet Yılmaz şu derslere giriyor: 9A Matematik (4 saat), 10A Matematik (5 saat). Toplam 9 saat/hafta.",
  "data": [
    { "class": "9A", "subject": "Matematik", "weeklyHours": 4 },
    { "class": "10A", "subject": "Matematik", "weeklyHours": 5 }
  ],
  "confidence": 0.92
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `kind` | "query" | Required |
| `answer` | string TR | Kullanıcıya gösterilecek metinsel cevap |
| `data` | array? | Opsiyonel ek yapısal bilgi (UI render edebilir) |
| `confidence` | float? | AI güveni |
| `explanation` | string? | Opsiyonel ek açıklama |

### kind: "tool_call"

```json
{
  "kind": "tool_call",
  "tool": "getTeacherActivities",
  "args": { "teacher": "Ahmet Yılmaz" },
  "reasoning": "Ahmet'in derslerini öğrenmem lazım"
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `kind` | "tool_call" | Required |
| `tool` | string | Tool adı (`electron/ai/tools.ts`'deki anahtardan biri) |
| `args` | object | Tool argümanları |
| `reasoning` | string? | AI'nın bu tool'u neden çağırdığı (logging için) |

App tool'u çalıştırır → sonucu history'e ekler → AI ikinci tur çağrısında query/constraint döndürür. Max iterasyon: 3 (`MAX_TOOL_ITERATIONS` `electron/ai/client.ts`).

Bilinen tool'lar:
- `getTeacherActivities({teacher})` — bir öğretmenin tüm aktiviteleri + total
- `getClassActivities({class})` — bir sınıfın aktiviteleri
- `getSubjectTeachers({subject})` — bir branşı veren öğretmenler
- `getActivityDetails({class, subject})` — sınıf×branş detayı
- `searchTeacher({query})` — fuzzy öğretmen arama
- `getTeachersBySubject({subject})` — teacher_subjects atamasına göre liste
- `countConstraints()` — kısıtlama özet sayıları
- `getScheduleSettings()` — gün/saat iskelet bilgisi
- `listActiveConstraints()` — aktif kısıtlama listesi

### kind: "schedule_update"

```json
{
  "kind": "schedule_update",
  "action": "extend_breaks",
  "params": { "minutes": 20 },
  "explanation": "Teneffüs sürelerini 20 dakika uzatma önerisi. Uygulamak için onaylayın.",
  "confidence": 0.85
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `kind` | "schedule_update" | Required |
| `action` | string | Action adı: `extend_breaks`, `add_hours_to_day`, `set_hours_per_day`, `remove_day`, `add_day` |
| `params` | object | Action'a göre değişen alanlar |
| `explanation` | string TR | Kullanıcıya gösterilecek açıklama |
| `confidence` | float? | AI güveni |

UI tarafı her zaman onay diyaloğu göstermelidir; AI doğrudan apply edemez.

### kind: "data_mutation"

```json
{
  "kind": "data_mutation",
  "actions": [
    {
      "op": "add_subject",
      "params": { "name": "Sanat Eğitimi" },
      "description": "\"Sanat Eğitimi\" branşını ekle (yoksa)"
    },
    {
      "op": "link_teacher_subject",
      "params": { "teacher": "Ahmet Yılmaz", "subject": "Sanat Eğitimi" },
      "description": "Ahmet Yılmaz'a Sanat Eğitimi yeterliliği ekle"
    },
    {
      "op": "add_activity",
      "params": { "class": "10F", "subject": "Sanat Eğitimi", "teacher": "Ahmet Yılmaz", "weeklyHours": 2 },
      "description": "10F sınıfına 2 saat Sanat Eğitimi (Ahmet Yılmaz)"
    }
  ],
  "explanation": "3 işlem önerildi: branş, yeterlilik, ders ataması",
  "requiresConfirmation": true,
  "confidence": 0.9
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `kind` | "data_mutation" | Required |
| `actions` | array (≥1) | Çoklu atomik CRUD işlemi |
| `actions[].op` | enum | 23 değerden biri (aşağıdaki tablo) |
| `actions[].params` | object | Op'a göre değişen alanlar (örn `{name, capacity}` veya `{teacher, subject}`) |
| `actions[].description` | string TR | Kullanıcının onaylayacağı satır özeti |
| `explanation` | string TR | Tüm action listesinin genel özeti |
| `requiresConfirmation` | true | Sabit — AI doğrudan apply edemez |
| `confidence` | float? | AI güveni |

#### Desteklenen `op` Değerleri (23 toplam)

**Öğretmen:** `add_teacher`, `update_teacher`, `delete_teacher`
**Branş:** `add_subject`, `update_subject`, `delete_subject`
**Sınıf:** `add_class`, `update_class`, `delete_class`
**Kademe:** `add_class_year`, `delete_class_year`
**Derslik:** `add_room`, `update_room`, `delete_room`
**Aktivite:** `add_activity`, `update_activity`, `delete_activity`
**Gün:** `add_day`, `delete_day`
**Saat:** `add_hour`, `delete_hour`
**İlişki:** `link_teacher_subject`, `unlink_teacher_subject`

#### Yan Etki & İdempotency

- Implementasyon: `electron/ai/mutation-executor.ts`
- IPC handler: `ai:applyMutations` (kullanıcı onayından sonra çağrılır)
- Çoklu action sırayla işlenir; bir action başarısız olsa diğerleri devam eder (kısmen başarı modeli — `DataMutationApplyResult` ile UI'a bilgilenir).
- İsim eşleştirmesi idempotent: zaten var olan `name`'li teacher/subject/room/class duplicate yaratılmaz — mevcut id kullanılır.
- `add_activity` öğretmen verilirse `teacher_subjects` ilişkisini otomatik kurar (yoksa).

#### DESTRUCTIVE Uyarısı

`delete_*` op'ları için `explanation` alanında açık onay metni şart:
> "Ahmet Yılmaz öğretmenini ve atandığı tüm dersleri silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?"

UI bu durumda kırmızı çerçeveli destructive kart gösterir (`AIPanel.tsx`).

## Constraint Object Şeması

```json
{
  "type": "TEACHER_NOT_AVAILABLE",
  "weight": 100,
  "active": true,
  "params": { /* type'a göre değişen alanlar */ }
}
```

`type` alanı bizim **iç enum'umuz**. Mapper bunu FET XML tagına çevirir. AI doğrudan FET tag'i üretmiyor — bizim aracı katmanımız var. Bu sayede FET'in API'si değişse bile AI'ı yeniden eğitmek zorunda kalmıyoruz.

## Tip Tablosu

### Öğretmen Kısıtlamaları

#### `TEACHER_NOT_AVAILABLE`
**FET:** `ConstraintTeacherNotAvailableTimes`
```json
{
  "type": "TEACHER_NOT_AVAILABLE",
  "weight": 100,
  "active": true,
  "params": {
    "teacher": "Ahmet Yılmaz",
    "slots": [
      { "day": "Cuma", "hour": 2 },
      { "day": "Cuma", "hour": 5 }
    ]
  }
}
```

#### `TEACHER_MAX_DAYS_PER_WEEK`
```json
{
  "type": "TEACHER_MAX_DAYS_PER_WEEK",
  "weight": 100,
  "active": true,
  "params": { "teacher": "Ahmet Yılmaz", "maxDays": 4 }
}
```

#### `TEACHER_MAX_HOURS_DAILY`
```json
{
  "type": "TEACHER_MAX_HOURS_DAILY",
  "weight": 100,
  "active": true,
  "params": { "teacher": "Ayşe Demir", "maxHours": 6 }
}
```

#### `TEACHER_MAX_GAPS_PER_DAY`
```json
{
  "type": "TEACHER_MAX_GAPS_PER_DAY",
  "weight": 80,
  "active": true,
  "params": { "teacher": "Ahmet Yılmaz", "maxGaps": 1 }
}
```

#### `TEACHER_MAX_GAPS_PER_WEEK`
```json
{
  "type": "TEACHER_MAX_GAPS_PER_WEEK",
  "weight": 80,
  "active": true,
  "params": { "teacher": "Ahmet Yılmaz", "maxGaps": 3 }
}
```

#### `TEACHERS_MAX_GAPS_PER_WEEK`
Tüm öğretmenler için.
```json
{
  "type": "TEACHERS_MAX_GAPS_PER_WEEK",
  "weight": 70,
  "active": true,
  "params": { "maxGaps": 3 }
}
```

### Sınıf Kısıtlamaları

#### `CLASS_NOT_AVAILABLE`
**FET:** `ConstraintStudentsSetNotAvailableTimes`
```json
{
  "type": "CLASS_NOT_AVAILABLE",
  "weight": 100,
  "active": true,
  "params": {
    "class": "10F",
    "slots": [{ "day": "Pazartesi", "hour": 1 }]
  }
}
```

#### `CLASS_MAX_GAPS_PER_WEEK`
```json
{
  "type": "CLASS_MAX_GAPS_PER_WEEK",
  "weight": 100,
  "active": true,
  "params": { "class": "10F", "maxGaps": 0 }
}
```

### Ders/Aktivite Kısıtlamaları

#### `SUBJECT_NOT_ON_DAY` (sınıf bazlı)
**FET:** Her ilgili Activity için `ConstraintActivityPreferredTimeSlots` (negatif liste) veya selection-based constraint.
```json
{
  "type": "SUBJECT_NOT_ON_DAY",
  "weight": 100,
  "active": true,
  "params": {
    "subject": "Matematik",
    "class": "10F",       // null ise tüm sınıflar için
    "days": ["Cuma"]
  }
}
```

#### `SUBJECT_PREFERRED_HOURS`
```json
{
  "type": "SUBJECT_PREFERRED_HOURS",
  "weight": 80,
  "active": true,
  "params": {
    "subject": "Matematik",
    "class": null,           // tüm sınıflarda matematik
    "preferredHours": [1, 2, 3]   // sadece ilk 3 derste
  }
}
```

#### `SUBJECT_LAST_HOUR_OF_DAY`
```json
{
  "type": "SUBJECT_LAST_HOUR_OF_DAY",
  "weight": 100,
  "active": true,
  "params": { "subject": "Beden Eğitimi", "class": null }
}
```

#### `SUBJECT_MAX_HOURS_DAILY`
```json
{
  "type": "SUBJECT_MAX_HOURS_DAILY",
  "weight": 100,
  "active": true,
  "params": { "subject": "Matematik", "class": "10F", "maxHours": 1 }
}
```

#### `SUBJECT_CONSECUTIVE_HOURS`
Çift saat (block) tercihi.
```json
{
  "type": "SUBJECT_CONSECUTIVE_HOURS",
  "weight": 80,
  "active": true,
  "params": { "subject": "Resim", "class": "9A", "blockDuration": 2 }
}
```

### Derslik Kısıtlamaları

#### `ROOM_NOT_AVAILABLE`
```json
{
  "type": "ROOM_NOT_AVAILABLE",
  "weight": 100,
  "active": true,
  "params": {
    "room": "Lab1",
    "slots": [{ "day": "Cuma", "hour": 0 }]   // gün boş ise tüm gün
  }
}
```

#### `SUBJECT_PREFERRED_ROOM`
```json
{
  "type": "SUBJECT_PREFERRED_ROOM",
  "weight": 100,
  "active": true,
  "params": { "subject": "Fizik", "room": "Lab1" }
}
```

#### `TEACHER_HOME_ROOM`
```json
{
  "type": "TEACHER_HOME_ROOM",
  "weight": 100,
  "active": true,
  "params": { "teacher": "Ahmet Yılmaz", "room": "101" }
}
```

#### `CLASS_HOME_ROOM`
```json
{
  "type": "CLASS_HOME_ROOM",
  "weight": 100,
  "active": true,
  "params": { "class": "10F", "room": "205" }
}
```

## Weight (Ağırlık) Mantığı

FET, kısıtlamaları **soft** (esnek) veya **hard** (zorunlu) olarak değerlendirir:
- `weight: 100` → hard, ihlal edilemez (override edilemiyorsa çözüm bulunmaz)
- `weight: 80-99` → güçlü tercih, ihlal cezalı
- `weight: 50-79` → orta tercih
- `weight: 1-49` → zayıf tercih

**Default ağırlıklar:**
- Kullanıcı "olmasın", "yasak", "kesinlikle" derse: 100
- "tercih ederim", "olsa iyi olur" derse: 80
- "mümkünse" derse: 60

## Slot Tipi

```typescript
type Slot = {
  day: TurkishDayName | null;   // null = tüm günler
  hour: number | null;          // 1-indexed, null = tüm saatler
};
```

Eğer `day` veya `hour` `null` ise, mapper bunu cartesian product yapar (tüm günlerin o saati / o günün tüm saatleri).

## Genişletilmiş Type Listesi (60 tip toplam)

Yukarıdaki 17 temel tipe ek olarak FET 6.x ile birebir eşleşen 43 yeni constraint type eklendi.
Tam liste için **kaynak kontrat** dosyaları:

- `electron/ai/schema.ts` → `ConstraintTypeEnum`
- `electron/ipc/_schemas.ts` → `ConstraintTypeEnum`
- `src/lib/types.ts` → `ConstraintType` union
- `src/lib/formatConstraint.ts` → Türkçe label + format
- `electron/fet/constraints/handlers.ts` → FET XML builder eşleşmeleri

### Eklenen 43 yeni tip (kategori bazlı):

**Öğretmen (10):** `TEACHER_MIN_HOURS_DAILY`, `TEACHER_NOT_AVAILABLE_INTERVAL`,
`TEACHER_MIN_DAYS_PER_WEEK`, `TEACHER_MAX_HOURS_CONTINUOUSLY`,
`TEACHER_MAX_BUILDING_CHANGES_PER_DAY`, `TEACHER_MAX_BUILDING_CHANGES_PER_WEEK`,
`TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES`, `TEACHER_NOT_FIRST_HOUR`,
`TEACHER_NOT_LAST_HOUR`, `TEACHER_MIN_REST_BETWEEN_DAYS`.

**Sınıf (8):** `CLASS_MAX_HOURS_DAILY`, `CLASS_MIN_HOURS_DAILY`, `CLASS_MAX_GAPS_PER_DAY`,
`CLASS_EARLY_MAX_BEGINNINGS`, `CLASS_MAX_BUILDING_CHANGES_PER_DAY`,
`CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES`, `CLASS_NOT_FIRST_HOUR`,
`CLASS_MAX_HOURS_CONTINUOUSLY`.

**Aktivite / Branş (10):** `ACTIVITY_FIXED_TIME`, `ACTIVITIES_SAME_STARTING_TIME`,
`ACTIVITIES_NOT_OVERLAPPING`, `ACTIVITIES_SAME_STARTING_DAY`,
`ACTIVITY_ENDS_STUDENTS_DAY`, `SUBJECT_NOT_FIRST_HOUR`,
`MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM`, `MIN_GAPS_BETWEEN_ACTIVITIES`,
`MAX_GAPS_BETWEEN_ACTIVITIES`, `ACTIVITY_PREFERRED_STARTING_TIMES`.

**Mekan / Derslik (8):** `SUBJECT_PREFERRED_ROOMS`, `TEACHER_PREFERRED_ROOM`,
`TEACHER_PREFERRED_ROOMS`, `ACTIVITY_PREFERRED_ROOM`, `ACTIVITY_PREFERRED_ROOMS`,
`SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM`, `ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS`,
`STUDENTS_SET_HOME_ROOMS`.

**Genel (7):** `BREAK_TIMES`, `ALL_TEACHERS_MAX_HOURS_DAILY`,
`ALL_TEACHERS_MAX_DAYS_PER_WEEK`, `STUDENTS_MAX_GAPS_PER_WEEK`,
`STUDENTS_EARLY_MAX_BEGINNINGS`, `STUDENTS_MAX_HOURS_DAILY`,
`MAX_TOTAL_ACTIVITIES_FROM_SET`.

## Zod Schema (Validation)

```typescript
import { z } from 'zod';

export const ConstraintTypeEnum = z.enum([
  'TEACHER_NOT_AVAILABLE',
  'TEACHER_MAX_DAYS_PER_WEEK',
  'TEACHER_MAX_HOURS_DAILY',
  'TEACHER_MAX_GAPS_PER_DAY',
  'TEACHER_MAX_GAPS_PER_WEEK',
  'TEACHERS_MAX_GAPS_PER_WEEK',
  'CLASS_NOT_AVAILABLE',
  'CLASS_MAX_GAPS_PER_WEEK',
  'SUBJECT_NOT_ON_DAY',
  'SUBJECT_PREFERRED_HOURS',
  'SUBJECT_LAST_HOUR_OF_DAY',
  'SUBJECT_MAX_HOURS_DAILY',
  'SUBJECT_CONSECUTIVE_HOURS',
  'ROOM_NOT_AVAILABLE',
  'SUBJECT_PREFERRED_ROOM',
  'TEACHER_HOME_ROOM',
  'CLASS_HOME_ROOM',
  // ... + 43 yeni (yukarıdaki "Genişletilmiş Type Listesi" bölümüne bakınız)
]);

export const SlotSchema = z.object({
  day: z.string().nullable(),
  hour: z.number().int().min(1).max(20).nullable(),
});

export const AIConstraintSchema = z.object({
  type: ConstraintTypeEnum,
  weight: z.number().int().min(0).max(100),
  active: z.boolean(),
  params: z.record(z.any()),
});

/** kind: "constraint" — varsayılan, kind eksikse de kabul edilir. */
export const ConstraintResponseSchema = z.object({
  kind: z.literal('constraint').optional(),
  constraints: z.array(AIConstraintSchema),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  warnings: z.array(z.string()).default([]),
  unresolved: z.array(z.string()).default([]),
});

/** kind: "query" — doğal dil cevabı. */
export const QueryResponseSchema = z.object({
  kind: z.literal('query'),
  answer: z.string(),
  data: z.array(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  explanation: z.string().optional(),
});

/** kind: "tool_call" — iteratif tool çağrısı. */
export const ToolCallResponseSchema = z.object({
  kind: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.any()).default({}),
  reasoning: z.string().optional(),
});

/** kind: "schedule_update" — kullanıcı onayı ile program ayar değişikliği. */
export const ScheduleUpdateResponseSchema = z.object({
  kind: z.literal('schedule_update'),
  action: z.string().min(1),
  params: z.record(z.any()),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

/** kind: "data_mutation" — kullanıcı onayıyla CRUD işlem(ler)i. */
export const DataMutationOpEnum = z.enum([
  'add_teacher', 'update_teacher', 'delete_teacher',
  'add_subject', 'update_subject', 'delete_subject',
  'add_class',   'update_class',   'delete_class',
  'add_class_year', 'delete_class_year',
  'add_room',    'update_room',    'delete_room',
  'add_activity','update_activity','delete_activity',
  'add_day',     'delete_day',
  'add_hour',    'delete_hour',
  'link_teacher_subject', 'unlink_teacher_subject',
]);
export const DataMutationActionSchema = z.object({
  op: DataMutationOpEnum,
  params: z.record(z.any()),
  description: z.string().min(1),
});
export const DataMutationResponseSchema = z.object({
  kind: z.literal('data_mutation'),
  actions: z.array(DataMutationActionSchema).min(1),
  explanation: z.string(),
  requiresConfirmation: z.literal(true),
  confidence: z.number().min(0).max(1).optional(),
});

export const AIResponseSchema = z.union([
  QueryResponseSchema,
  ToolCallResponseSchema,
  ScheduleUpdateResponseSchema,
  DataMutationResponseSchema,
  ConstraintResponseSchema,
]);
```

`validateAIResponse` (electron/ai/schema.ts) `kind` alanı eksik gelirse legacy
constraint formatı olarak parse eder — fine-tune edilmiş eski modeller hâlâ çalışır.

## Mapper: AI JSON → FET XML

`electron/ai/constraint-mapper.ts` her tip için bir handler içerir:

```typescript
const handlers: Record<ConstraintType, ConstraintHandler> = {
  TEACHER_NOT_AVAILABLE: (params, ctx) => ({
    section: 'time',
    xml: buildTeacherNotAvailableTimes(params.teacher, params.slots, params.weight)
  }),
  // ...
};
```

Mapper, eşleştirilemeyen isimleri (örn: AI "Ahmet hoca" dedi ama DB'de iki tane Ahmet var) `unresolved`'a ekler ve kullanıcıya seçtirir.
