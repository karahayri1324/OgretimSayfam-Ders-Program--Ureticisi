import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { TimetableResult, TimetableSlot } from '../../../src/lib/types.js';

type TimetableRow = {
  id: number;
  name: string | null;
  generated_at: string;
  fet_input_xml: string;
  status: string;
  conflicts_json: string | null;
  duration_ms: number | null;
};

type SlotRow = {
  activity_id: number;
  source_activity_id: number | null;
  day_index: number;
  hour_index: number;
  class_id: number | null;
  class_name: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  subject_id: number | null;
  subject_name: string | null;
  room_id: number | null;
  room_name: string | null;
};

function rowToResult(r: TimetableRow, slots: TimetableSlot[]): TimetableResult {
  let conflicts: string[] = [];
  try {
    conflicts = r.conflicts_json ? (JSON.parse(r.conflicts_json) as string[]) : [];
  } catch {
    conflicts = [];
  }
  const status: TimetableResult['status'] =
    r.status === 'success' || r.status === 'partial' || r.status === 'failed'
      ? r.status
      : 'failed';
  return {
    id: r.id,
    generatedAt: r.generated_at,
    status,
    durationMs: r.duration_ms ?? 0,
    slots,
    conflicts,
  };
}

export type SaveTimetableInput = {
  name?: string | null;
  fetInputXml: string;
  status: 'success' | 'partial' | 'failed';
  conflicts?: string[];
  durationMs?: number;
  slots: Array<{
    activityId: number;
    sourceActivityId?: number | null;
    dayIndex: number;
    hourIndex: number;
    classId?: number | null;
    teacherId?: number | null;
    subjectId?: number | null;
    roomId?: number | null;
  }>;
};

export const timetablesRepo = {
  save(input: SaveTimetableInput): number {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO timetables
             (school_id, name, fet_input_xml, status, conflicts_json, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          schoolId,
          input.name ?? null,
          input.fetInputXml,
          input.status,
          JSON.stringify(input.conflicts ?? []),
          input.durationMs ?? null,
        );
      const ttId = Number(result.lastInsertRowid);
      const slotStmt = db.prepare(
        `INSERT INTO timetable_slots
           (timetable_id, activity_id, source_activity_id, day_index, hour_index,
            class_id, teacher_id, subject_id, room_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of input.slots) {
        slotStmt.run(
          ttId,
          s.activityId,
          s.sourceActivityId ?? null,
          s.dayIndex,
          s.hourIndex,
          s.classId ?? null,
          s.teacherId ?? null,
          s.subjectId ?? null,
          s.roomId ?? null,
        );
      }
      return ttId;
    });
    return trx();
  },

  latest(): TimetableResult | null {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const row = db
      .prepare(
        `SELECT id, name, generated_at, fet_input_xml, status, conflicts_json, duration_ms
         FROM timetables
         WHERE school_id = ?
         ORDER BY generated_at DESC, id DESC
         LIMIT 1`,
      )
      .get(schoolId) as TimetableRow | undefined;
    if (!row) return null;
    const slots = this.slotsFor(row.id);
    return rowToResult(row, slots);
  },

  slotsFor(timetableId: number): TimetableSlot[] {
    const rows = getDb()
      .prepare(
        `SELECT
           ts.activity_id, ts.source_activity_id, ts.day_index, ts.hour_index,
           ts.class_id, c.name AS class_name,
           ts.teacher_id, t.name AS teacher_name,
           ts.subject_id, s.name AS subject_name,
           ts.room_id, r.name AS room_name
         FROM timetable_slots ts
         LEFT JOIN classes c ON c.id = ts.class_id
         LEFT JOIN teachers t ON t.id = ts.teacher_id
         LEFT JOIN subjects s ON s.id = ts.subject_id
         LEFT JOIN rooms r ON r.id = ts.room_id
         WHERE ts.timetable_id = ?
         ORDER BY ts.day_index, ts.hour_index`,
      )
      .all(timetableId) as SlotRow[];

    return rows.map((r) => ({
      activityId: r.activity_id,
      dayIndex: r.day_index,
      hourIndex: r.hour_index,
      classId: r.class_id,
      className: r.class_name ?? '',
      teacherId: r.teacher_id,
      teacherName: r.teacher_name ?? '',
      subjectId: r.subject_id,
      subjectName: r.subject_name ?? '',
      roomId: r.room_id,
      roomName: r.room_name,
    }));
  },
};
