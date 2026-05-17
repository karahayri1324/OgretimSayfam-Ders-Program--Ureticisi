import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { ClassInput, ClassRoom } from '../../../src/lib/types.js';

type ClassRow = {
  id: number;
  year_id: number | null;
  name: string;
  student_count: number | null;
  home_room_id: number | null;
};

function rowToClass(r: ClassRow): ClassRoom {
  return {
    id: r.id,
    yearId: r.year_id,
    name: r.name,
    studentCount: r.student_count ?? 0,
    homeRoomId: r.home_room_id,
  };
}

export const classesRepo = {
  list(): ClassRoom[] {
    const rows = getDb()
      .prepare(
        `SELECT id, year_id, name, student_count, home_room_id
         FROM classes WHERE school_id = ?
         ORDER BY name COLLATE NOCASE`,
      )
      .all(schoolsRepo.getActiveId()) as ClassRow[];
    return rows.map(rowToClass);
  },

  get(id: number): ClassRoom | null {
    const row = getDb()
      .prepare(
        `SELECT id, year_id, name, student_count, home_room_id
         FROM classes WHERE id = ? AND school_id = ?`,
      )
      .get(id, schoolsRepo.getActiveId()) as ClassRow | undefined;
    return row ? rowToClass(row) : null;
  },

  create(input: ClassInput): number {
    const result = getDb()
      .prepare(
        `INSERT INTO classes (school_id, year_id, name, student_count, home_room_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        schoolsRepo.getActiveId(),
        input.yearId ?? null,
        input.name,
        input.studentCount ?? 0,
        input.homeRoomId ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  update(id: number, patch: Partial<ClassInput>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.yearId !== undefined) {
      fields.push('year_id = ?');
      values.push(patch.yearId);
    }
    if (patch.studentCount !== undefined) {
      fields.push('student_count = ?');
      values.push(patch.studentCount);
    }
    if (patch.homeRoomId !== undefined) {
      fields.push('home_room_id = ?');
      values.push(patch.homeRoomId);
    }
    if (fields.length === 0) return;
    values.push(id);
    getDb()
      .prepare(`UPDATE classes SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM classes WHERE id = ?').run(id);
  },
};
