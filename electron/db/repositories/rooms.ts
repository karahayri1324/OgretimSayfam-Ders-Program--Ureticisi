import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Room, RoomInput } from '../../../src/lib/types.js';

type RoomRow = {
  id: number;
  name: string;
  capacity: number | null;
  building: string | null;
  notes: string | null;
};

function rowToRoom(r: RoomRow): Room {
  return {
    id: r.id,
    name: r.name,
    capacity: r.capacity ?? 0,
    building: r.building,
    notes: r.notes,
  };
}

export const roomsRepo = {
  list(): Room[] {
    const rows = getDb()
      .prepare(
        `SELECT id, name, capacity, building, notes
         FROM rooms WHERE school_id = ?
         ORDER BY name COLLATE NOCASE`,
      )
      .all(schoolsRepo.getActiveId()) as RoomRow[];
    return rows.map(rowToRoom);
  },

  get(id: number): Room | null {
    const row = getDb()
      .prepare(
        `SELECT id, name, capacity, building, notes
         FROM rooms WHERE id = ? AND school_id = ?`,
      )
      .get(id, schoolsRepo.getActiveId()) as RoomRow | undefined;
    return row ? rowToRoom(row) : null;
  },

  create(input: RoomInput): number {
    const result = getDb()
      .prepare(
        `INSERT INTO rooms (school_id, name, capacity, building, notes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        schoolsRepo.getActiveId(),
        input.name,
        input.capacity ?? 30,
        input.building ?? null,
        input.notes ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  update(id: number, patch: Partial<RoomInput>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.capacity !== undefined) {
      fields.push('capacity = ?');
      values.push(patch.capacity);
    }
    if (patch.building !== undefined) {
      fields.push('building = ?');
      values.push(patch.building);
    }
    if (patch.notes !== undefined) {
      fields.push('notes = ?');
      values.push(patch.notes);
    }
    if (fields.length === 0) return;
    values.push(id);
    getDb()
      .prepare(`UPDATE rooms SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM rooms WHERE id = ?').run(id);
  },
};
