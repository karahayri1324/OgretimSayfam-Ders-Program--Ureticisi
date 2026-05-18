import type Database from 'better-sqlite3';
import { log } from '../utils/logger.js';

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const V1_SCHEMA = `
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  UNIQUE (school_id, order_index)
);

CREATE TABLE IF NOT EXISTS hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  UNIQUE (school_id, order_index)
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_code TEXT,
  color TEXT,
  notes TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weekly_target_hours INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS class_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 30,
  building TEXT,
  notes TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year_id INTEGER REFERENCES class_years(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  student_count INTEGER DEFAULT 0,
  home_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  weekly_hours INTEGER NOT NULL CHECK (weekly_hours > 0),
  block_duration INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  UNIQUE (school_id, class_id, subject_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text TEXT NOT NULL,
  parent_id INTEGER REFERENCES ai_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_school_created
  ON ai_messages (school_id, created_at);

CREATE TABLE IF NOT EXISTS constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 100 CHECK (weight BETWEEN 0 AND 100),
  active INTEGER NOT NULL DEFAULT 1,
  params_json TEXT NOT NULL,
  source TEXT NOT NULL,
  ai_message_id INTEGER REFERENCES ai_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_constraints_school_active
  ON constraints (school_id, active);

CREATE TABLE IF NOT EXISTS timetables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  fet_input_xml TEXT NOT NULL,
  status TEXT NOT NULL,
  conflicts_json TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timetable_id INTEGER NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL,
  source_activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  day_index INTEGER NOT NULL,
  hour_index INTEGER NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_slots_timetable
  ON timetable_slots (timetable_id);

CREATE INDEX IF NOT EXISTS idx_slots_class_day
  ON timetable_slots (timetable_id, class_id, day_index);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

const V2_SCHEMA = `
ALTER TABLE activities ADD COLUMN split_group_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_activities_split_group
  ON activities (school_id, split_group_id);

CREATE TABLE IF NOT EXISTS day_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  hour_order_index INTEGER NOT NULL,
  name TEXT,
  start_time TEXT,
  end_time TEXT,
  UNIQUE (school_id, day_id, hour_order_index)
);

CREATE INDEX IF NOT EXISTS idx_day_hours_school_day
  ON day_hours (school_id, day_id, hour_order_index);
`;

export const migrations: Record<number, string> = {
  1: V1_SCHEMA,
  2: V2_SCHEMA,
};

export function runMigrations(db: Database.Database): void {
  db.exec(CREATE_MIGRATIONS_TABLE);

  const appliedRows = db
    .prepare('SELECT version FROM _migrations ORDER BY version')
    .all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  const versions = Object.keys(migrations)
    .map((v) => Number(v))
    .sort((a, b) => a - b);

  const insert = db.prepare('INSERT INTO _migrations (version) VALUES (?)');

  for (const v of versions) {
    if (applied.has(v)) continue;
    const sql = migrations[v];
    if (!sql) continue;
    log.info(`Migration uygulanıyor: v${v}`);
    const trx = db.transaction(() => {
      db.exec(sql);
      insert.run(v);
    });
    try {
      trx();
      log.info(`Migration tamamlandı: v${v}`);
    } catch (e) {
      log.error(`Migration başarısız: v${v}`, { error: String(e) });
      throw new Error(`Veritabanı migration v${v} başarısız: ${String(e)}`);
    }
  }
}
