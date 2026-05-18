import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Day } from '../../../src/lib/types.js';

type DayRow = {
  id: number;
  name: string;
  order_index: number;
};

function rowToDay(r: DayRow): Day {
  return { id: r.id, name: r.name, orderIndex: r.order_index };
}

export type DayInput = { name: string };

export const daysRepo = {
  list(): Day[] {
    const rows = getDb()
      .prepare(
        `SELECT id, name, order_index
         FROM days WHERE school_id = ?
         ORDER BY order_index ASC`,
      )
      .all(schoolsRepo.getActiveId()) as DayRow[];
    return rows.map(rowToDay);
  },

  replaceAll(names: string[]): Day[] {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      db.prepare('DELETE FROM days WHERE school_id = ?').run(schoolId);
      const insert = db.prepare(
        'INSERT INTO days (school_id, name, order_index) VALUES (?, ?, ?)',
      );
      names.forEach((name, i) => insert.run(schoolId, name, i));
    });
    trx();
    return this.list();
  },
};
