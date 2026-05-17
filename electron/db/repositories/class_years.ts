import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { ClassYear } from '../../../src/lib/types.js';

type Row = { id: number; name: string; order_index: number };

function rowToYear(r: Row): ClassYear {
  return { id: r.id, name: r.name, orderIndex: r.order_index };
}

export const classYearsRepo = {
  list(): ClassYear[] {
    const rows = getDb()
      .prepare(
        `SELECT id, name, order_index FROM class_years
         WHERE school_id = ?
         ORDER BY order_index ASC, id ASC`,
      )
      .all(schoolsRepo.getActiveId()) as Row[];
    return rows.map(rowToYear);
  },

  get(id: number): ClassYear | null {
    const r = getDb()
      .prepare(`SELECT id, name, order_index FROM class_years WHERE id = ?`)
      .get(id) as Row | undefined;
    return r ? rowToYear(r) : null;
  },

  create(name: string, orderIndex = 0): number {
    const result = getDb()
      .prepare(
        `INSERT INTO class_years (school_id, name, order_index) VALUES (?, ?, ?)`,
      )
      .run(schoolsRepo.getActiveId(), name, orderIndex);
    return Number(result.lastInsertRowid);
  },

  update(id: number, patch: { name?: string; orderIndex?: number }): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.orderIndex !== undefined) {
      fields.push('order_index = ?');
      values.push(patch.orderIndex);
    }
    if (fields.length === 0) return;
    values.push(id);
    getDb()
      .prepare(`UPDATE class_years SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM class_years WHERE id = ?').run(id);
  },
};
