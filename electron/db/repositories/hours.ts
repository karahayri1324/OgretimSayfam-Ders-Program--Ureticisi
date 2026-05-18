import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Hour } from '../../../src/lib/types.js';

type HourRow = {
  id: number;
  name: string;
  order_index: number;
  start_time: string | null;
  end_time: string | null;
};

function rowToHour(r: HourRow): Hour {
  return {
    id: r.id,
    name: r.name,
    orderIndex: r.order_index,
    startTime: r.start_time,
    endTime: r.end_time,
  };
}

export type HourInput = {
  name: string;
  startTime?: string | null;
  endTime?: string | null;
};

export const hoursRepo = {
  list(): Hour[] {
    const rows = getDb()
      .prepare(
        `SELECT id, name, order_index, start_time, end_time
         FROM hours WHERE school_id = ?
         ORDER BY order_index ASC`,
      )
      .all(schoolsRepo.getActiveId()) as HourRow[];
    return rows.map(rowToHour);
  },

  replaceAll(hours: HourInput[]): Hour[] {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      db.prepare('DELETE FROM hours WHERE school_id = ?').run(schoolId);
      const insert = db.prepare(
        `INSERT INTO hours (school_id, name, order_index, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)`,
      );
      hours.forEach((h, i) =>
        insert.run(schoolId, h.name, i, h.startTime ?? null, h.endTime ?? null),
      );
    });
    trx();
    return this.list();
  },
};
