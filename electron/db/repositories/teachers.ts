import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Teacher, TeacherInput } from '../../../src/lib/types.js';

type TeacherRow = {
  id: number;
  name: string;
  weekly_target_hours: number;
  notes: string | null;
};

function rowToTeacher(r: TeacherRow, subjectIds: number[]): Teacher {
  return {
    id: r.id,
    name: r.name,
    weeklyTargetHours: r.weekly_target_hours,
    notes: r.notes,
    subjectIds,
  };
}

export const teachersRepo = {
  list(): Teacher[] {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const rows = db
      .prepare(
        `SELECT id, name, weekly_target_hours, notes
         FROM teachers
         WHERE school_id = ?
         ORDER BY name COLLATE NOCASE`,
      )
      .all(schoolId) as TeacherRow[];

    const subjectRows = db
      .prepare(
        `SELECT ts.teacher_id AS teacherId, ts.subject_id AS subjectId
         FROM teacher_subjects ts
         JOIN teachers t ON t.id = ts.teacher_id
         WHERE t.school_id = ?`,
      )
      .all(schoolId) as { teacherId: number; subjectId: number }[];

    const map = new Map<number, number[]>();
    for (const sr of subjectRows) {
      const arr = map.get(sr.teacherId) ?? [];
      arr.push(sr.subjectId);
      map.set(sr.teacherId, arr);
    }

    return rows.map((r) => rowToTeacher(r, map.get(r.id) ?? []));
  },

  get(id: number): Teacher | null {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const row = db
      .prepare(
        `SELECT id, name, weekly_target_hours, notes
         FROM teachers WHERE id = ? AND school_id = ?`,
      )
      .get(id, schoolId) as TeacherRow | undefined;
    if (!row) return null;
    const subjectIds = (
      db
        .prepare(
          'SELECT subject_id AS subjectId FROM teacher_subjects WHERE teacher_id = ?',
        )
        .all(id) as { subjectId: number }[]
    ).map((x) => x.subjectId);
    return rowToTeacher(row, subjectIds);
  },

  create(input: TeacherInput): number {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO teachers (school_id, name, weekly_target_hours, notes)
           VALUES (?, ?, ?, ?)`,
        )
        .run(schoolId, input.name, input.weeklyTargetHours, input.notes ?? null);
      const teacherId = Number(result.lastInsertRowid);
      if (input.subjectIds && input.subjectIds.length > 0) {
        const stmt = db.prepare(
          'INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)',
        );
        for (const sid of input.subjectIds) stmt.run(teacherId, sid);
      }
      return teacherId;
    });
    return trx();
  },

  update(id: number, patch: Partial<TeacherInput>): void {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.weeklyTargetHours !== undefined) {
      fields.push('weekly_target_hours = ?');
      values.push(patch.weeklyTargetHours);
    }
    if (patch.notes !== undefined) {
      fields.push('notes = ?');
      values.push(patch.notes);
    }

    const trx = db.transaction(() => {
      if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE teachers SET ${fields.join(', ')} WHERE id = ?`).run(
          ...values,
        );
      }
      if (patch.subjectIds !== undefined) {
        db.prepare('DELETE FROM teacher_subjects WHERE teacher_id = ?').run(id);
        const stmt = db.prepare(
          'INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)',
        );
        for (const sid of patch.subjectIds) stmt.run(id, sid);
      }
    });
    trx();
  },

  delete(id: number): void {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      db.prepare('DELETE FROM teachers WHERE id = ?').run(id);
      const dupRows = db
        .prepare(
          `SELECT id, class_id, subject_id, weekly_hours FROM activities
           WHERE school_id = ? AND teacher_id IS NULL AND split_group_id IS NULL
             AND id NOT IN (
               SELECT MIN(id) FROM activities
               WHERE school_id = ? AND teacher_id IS NULL AND split_group_id IS NULL
               GROUP BY class_id, subject_id
             )`,
        )
        .all(schoolId, schoolId) as {
        id: number;
        class_id: number;
        subject_id: number;
        weekly_hours: number;
      }[];
      if (dupRows.length === 0) return;
      // Duplikeleri silmeden önce saatlerini tutulan (MIN id) satıra EKLE — aksi halde
      // öğretmen silme sınıfın müfredat saatini sessizce eritiyordu (örn. 2+4 saat → 2 saat).
      const addHours = db.prepare(
        `UPDATE activities SET weekly_hours = weekly_hours + ?
         WHERE school_id = ? AND teacher_id IS NULL AND split_group_id IS NULL
           AND class_id = ? AND subject_id = ?
           AND id = (
             SELECT MIN(id) FROM activities
             WHERE school_id = ? AND teacher_id IS NULL AND split_group_id IS NULL
               AND class_id = ? AND subject_id = ?
           )`,
      );
      for (const r of dupRows) {
        addHours.run(
          r.weekly_hours,
          schoolId,
          r.class_id,
          r.subject_id,
          schoolId,
          r.class_id,
          r.subject_id,
        );
      }
      const dupIds = dupRows.map((r) => r.id);
      const placeholders = dupIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM activities WHERE id IN (${placeholders})`).run(...dupIds);
      const idSet = new Set(dupIds);
      const cons = db
        .prepare(`SELECT id, params_json FROM constraints WHERE school_id = ?`)
        .all(schoolId) as { id: number; params_json: string }[];
      const del = db.prepare('DELETE FROM constraints WHERE id = ?');
      for (const c of cons) {
        let refs = false;
        try {
          const p = JSON.parse(c.params_json) as {
            activityId?: unknown;
            activityIds?: unknown;
          };
          if (typeof p.activityId === 'number' && idSet.has(p.activityId)) {
            refs = true;
          } else if (
            Array.isArray(p.activityIds) &&
            p.activityIds.some((x) => typeof x === 'number' && idSet.has(x))
          ) {
            refs = true;
          }
        } catch {
        }
        if (refs) del.run(c.id);
      }
    });
    trx();
  },
};
