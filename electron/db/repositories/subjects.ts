import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Subject, SubjectInput } from '../../../src/lib/types.js';

type SubjectRow = {
  id: number;
  name: string;
  short_code: string | null;
  color: string | null;
  notes: string | null;
};

function rowToSubject(r: SubjectRow): Subject {
  return {
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    color: r.color,
    notes: r.notes,
  };
}

export const subjectsRepo = {
  list(): Subject[] {
    const rows = getDb()
      .prepare(
        `SELECT id, name, short_code, color, notes
         FROM subjects WHERE school_id = ?
         ORDER BY name COLLATE NOCASE`,
      )
      .all(schoolsRepo.getActiveId()) as SubjectRow[];
    return rows.map(rowToSubject);
  },

  get(id: number): Subject | null {
    const row = getDb()
      .prepare(
        `SELECT id, name, short_code, color, notes
         FROM subjects WHERE id = ? AND school_id = ?`,
      )
      .get(id, schoolsRepo.getActiveId()) as SubjectRow | undefined;
    return row ? rowToSubject(row) : null;
  },

  create(input: SubjectInput): number {
    const result = getDb()
      .prepare(
        `INSERT INTO subjects (school_id, name, short_code, color, notes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        schoolsRepo.getActiveId(),
        input.name,
        input.shortCode ?? null,
        input.color ?? null,
        input.notes ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  update(id: number, patch: Partial<SubjectInput>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.shortCode !== undefined) {
      fields.push('short_code = ?');
      values.push(patch.shortCode);
    }
    if (patch.color !== undefined) {
      fields.push('color = ?');
      values.push(patch.color);
    }
    if (patch.notes !== undefined) {
      fields.push('notes = ?');
      values.push(patch.notes);
    }
    if (fields.length === 0) return;
    values.push(id);
    getDb()
      .prepare(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM subjects WHERE id = ?').run(id);
  },
};
