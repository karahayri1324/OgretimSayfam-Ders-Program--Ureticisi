import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Constraint, ConstraintInput, ConstraintType } from '../../../src/lib/types.js';

type ConstraintRow = {
  id: number;
  type: string;
  weight: number;
  active: number;
  params_json: string;
  source: string;
  ai_message_id: number | null;
  created_at: string;
  notes: string | null;
};

function rowToConstraint(r: ConstraintRow): Constraint {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(r.params_json) as Record<string, unknown>;
  } catch {
    params = {};
  }
  return {
    id: r.id,
    type: r.type as ConstraintType,
    weight: r.weight,
    active: r.active === 1,
    params,
    source: r.source === 'ai' ? 'ai' : 'manual',
    aiMessageId: r.ai_message_id,
    createdAt: r.created_at,
    notes: r.notes,
  };
}

export const constraintsRepo = {
  list(): Constraint[] {
    const rows = getDb()
      .prepare(
        `SELECT id, type, weight, active, params_json, source,
                ai_message_id, created_at, notes
         FROM constraints
         WHERE school_id = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all(schoolsRepo.getActiveId()) as ConstraintRow[];
    return rows.map(rowToConstraint);
  },

  listActive(): Constraint[] {
    const rows = getDb()
      .prepare(
        `SELECT id, type, weight, active, params_json, source,
                ai_message_id, created_at, notes
         FROM constraints
         WHERE school_id = ? AND active = 1
         ORDER BY created_at DESC, id DESC`,
      )
      .all(schoolsRepo.getActiveId()) as ConstraintRow[];
    return rows.map(rowToConstraint);
  },

  add(input: ConstraintInput): number {
    const result = getDb()
      .prepare(
        `INSERT INTO constraints
           (school_id, type, weight, active, params_json, source, ai_message_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        schoolsRepo.getActiveId(),
        input.type,
        input.weight,
        input.active === false ? 0 : 1,
        JSON.stringify(input.params ?? {}),
        input.source,
        input.aiMessageId ?? null,
        input.notes ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM constraints WHERE id = ?').run(id);
  },

  toggle(id: number, active: boolean): void {
    getDb()
      .prepare('UPDATE constraints SET active = ? WHERE id = ?')
      .run(active ? 1 : 0, id);
  },

  setWeight(id: number, weight: number): void {
    const w = Math.max(0, Math.min(100, Math.floor(weight)));
    getDb()
      .prepare('UPDATE constraints SET weight = ? WHERE id = ?')
      .run(w, id);
  },

  // Gün/saat kaldırılınca bayatlayan kısıt params'larını yerinde güncellemek için (örn. days[]/
  // slots[] dizisinden silinen güne ait elemanları çıkarmak). school_id ile sınırlı.
  updateParams(id: number, params: Record<string, unknown>): void {
    getDb()
      .prepare('UPDATE constraints SET params_json = ? WHERE id = ? AND school_id = ?')
      .run(JSON.stringify(params ?? {}), id, schoolsRepo.getActiveId());
  },
};
