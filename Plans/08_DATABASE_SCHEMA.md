# SQLite Database Schema

## Yer (kullanıcı dostu — Documents altında)

| Platform | Konum |
|---|---|
| Linux/Mac | `~/Documents/ÖğretimSayfam Ders Programı/veri.db` |
| Windows | `%USERPROFILE%\Documents\ÖğretimSayfam Ders Programı\veri.db` |

Chromium cache / cookies vs. ayrı `userData` klasöründe (kullanıcı bakmaz). Loglar:
`~/Documents/ÖğretimSayfam Ders Programı/loglar/YYYY-MM-DD.log`.

**Legacy migration:** İlk açılışta yeni dosya yoksa, eski `~/.config/ders-program-olusturucu/data.db` varsa otomatik kopyalanır (eski yedek olarak kalır).

## Migration Sistemi

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`electron/db/migrations.ts` versiyon listesi tutar:
```typescript
const migrations: Record<number, string> = {
  1: `CREATE TABLE schools (...)`,
  2: `ALTER TABLE teachers ADD COLUMN color TEXT`,
  // ...
};
```

Açılışta `MAX(version)`'dan sonraki tüm migration'lar uygulanır.

## Schema (v1)

### schools
Çoklu okul (profil) desteği. MVP'de sadece tek satır.
```sql
CREATE TABLE schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 0
);
```

### days
```sql
CREATE TABLE days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- "Pazartesi"
  order_index INTEGER NOT NULL,
  UNIQUE (school_id, order_index)
);
```

### hours
```sql
CREATE TABLE hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- "1. Ders"
  order_index INTEGER NOT NULL,
  start_time TEXT,             -- "08:30" (opsiyonel)
  end_time TEXT,               -- "09:10"
  UNIQUE (school_id, order_index)
);
```

### day_hours (v2)
Günlere özel ders saatleri (örn. Cuma 7 ders, diğer günler 8 ders).
Belirli bir gün için kayıt YOK ise o gün global `hours` tablosunu kullanır;
varsa o günün saatleri tamamen bu tablodan okunur.

```sql
CREATE TABLE day_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  hour_order_index INTEGER NOT NULL,
  name TEXT,                         -- "1. Ders"
  start_time TEXT,                   -- "08:30"
  end_time TEXT,                     -- "09:10"
  UNIQUE (school_id, day_id, hour_order_index)
);
CREATE INDEX idx_day_hours_school_day ON day_hours (school_id, day_id, hour_order_index);
```

**FET tarafında nasıl çalışır?** XML builder en uzun günü baz alarak tek bir
`Hours_List` üretir (örn. global 8 + Cuma override 7 ise Hours_List=8). Eksik
saat sayısına sahip günler için `ConstraintBreakTimes` eklenir; bu, kapsanan
slot'lara hiç aktivite yerleştirilmemesini garanti eder. `start_time` /
`end_time` UI display (timetable görüntüleme) için tutulur, FET'e gönderilmez.

### subjects
```sql
CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- "Matematik"
  short_code TEXT,             -- "MAT"
  color TEXT,                  -- "#3b82f6" (display rengi)
  notes TEXT,
  UNIQUE (school_id, name)
);
```

### teachers
```sql
CREATE TABLE teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weekly_target_hours INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE teacher_subjects (
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, subject_id)
);
```

### classes (sınıflar)
```sql
CREATE TABLE class_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- "9. Sınıf"
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year_id INTEGER REFERENCES class_years(id) ON DELETE SET NULL,
  name TEXT NOT NULL,          -- "10F"
  student_count INTEGER DEFAULT 0,
  home_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  UNIQUE (school_id, name)
);
```

### rooms
```sql
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- "101", "Lab1"
  capacity INTEGER DEFAULT 30,
  building TEXT,
  notes TEXT,
  UNIQUE (school_id, name)
);
```

### activities (asıl ders kayıtları)
"X sınıfı Y branşından Z hocayla N saat" mantığı.
```sql
CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  weekly_hours INTEGER NOT NULL CHECK (weekly_hours > 0),
  block_duration INTEGER NOT NULL DEFAULT 1,  -- 1=tek saat, 2=çift saat block
  notes TEXT,
  split_group_id INTEGER,                     -- v2: aynı saatte koşacak aktivite kümesi
  UNIQUE (school_id, class_id, subject_id, teacher_id)
);
CREATE INDEX idx_activities_split_group ON activities (school_id, split_group_id);
```

FET XML üretiminde 1 activity satırı → `weekly_hours / block_duration` adet `<Activity>` element olarak expand edilir, hepsi aynı `Activity_Group_Id`.

**`split_group_id` (v2):** NULL = bağımsız aktivite (varsayılan). Aynı değere
sahip aktiviteler aynı saatte başlamaya zorlanır
(`ConstraintActivitiesSameStartingTime`). Aynı sınıfı 2 gruba bölme senaryosunu
karşılar: örn. 9A görsel sanatlar + müzik aynı saatte, sınıf 2 gruba ayrılıyor.
Bu durumda Students_List'te o sınıf için paralellik kadar Subgroup yaratılır
(`9A_g1`, `9A_g2`) ve her split-üye aktivite kendi subgroup'una atanır; FET
böylece çakışma saymadan paralel yerleştirme yapar.

### constraints
```sql
CREATE TABLE constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  type TEXT NOT NULL,             -- "TEACHER_NOT_AVAILABLE"
  weight INTEGER NOT NULL DEFAULT 100 CHECK (weight BETWEEN 0 AND 100),
  active INTEGER NOT NULL DEFAULT 1,
  params_json TEXT NOT NULL,      -- JSON
  source TEXT NOT NULL,           -- "ai" | "manual"
  ai_message_id INTEGER REFERENCES ai_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX idx_constraints_school_active ON constraints (school_id, active);
```

### ai_messages
AI sohbet geçmişi.
```sql
CREATE TABLE ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text TEXT NOT NULL,
  parent_id INTEGER REFERENCES ai_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_messages_school_created ON ai_messages (school_id, created_at);
```

### timetables (üretilen sonuçlar)
```sql
CREATE TABLE timetables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT,                       -- "v1 - 16 Mayıs"
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  fet_input_xml TEXT NOT NULL,     -- input snapshot
  status TEXT NOT NULL,            -- "success" | "partial" | "failed"
  conflicts_json TEXT,
  duration_ms INTEGER
);

CREATE TABLE timetable_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timetable_id INTEGER NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL,    -- FET activity id (DB activity'siyle aynı olmayabilir, expand sonrası)
  source_activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  day_index INTEGER NOT NULL,
  hour_index INTEGER NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE INDEX idx_slots_timetable ON timetable_slots (timetable_id);
CREATE INDEX idx_slots_class_day ON timetable_slots (timetable_id, class_id, day_index);
```

### settings
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

Default değerler (ilk açılışta seed):
```
aiEndpoint = "mock://local"
aiTimeoutSec = "30"            -- saniye (eskiden aiTimeout, v2 migration ile rename)
fetTimeLimitSec = "120"        -- saniye (eskiden fetTimeLimit)
fetBinaryPath = ""   -- boş ise auto-detect
theme = "light"
language = "tr"
```

## Default Veriler (Seed)

İlk açılışta tek bir `schools` kaydı, default 5 gün (Pzt-Cum) ve 8 saat (1.Ders - 8.Ders) seed edilir.

```sql
INSERT INTO schools (name, is_active) VALUES ('Yeni Okul', 1);
-- days seed: Pazartesi, Salı, Çarşamba, Perşembe, Cuma
-- hours seed: 1. Ders ... 8. Ders
```

## Foreign Key Davranışı

`PRAGMA foreign_keys = ON;` — her connection açılışta. Cascade delete'ler şema seviyesinde tanımlı.

## Backup

Her timetable üretimi öncesi `data.db.backup-{timestamp}` olarak kopyalanır (son 5 backup saklanır).
