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
      const savedDayHours = db
        .prepare(
          `SELECT d.name AS day_name, dh.hour_order_index AS hoi, dh.name AS name,
                  dh.start_time AS st, dh.end_time AS et
           FROM day_hours dh
           JOIN days d ON d.id = dh.day_id
           WHERE dh.school_id = ?`,
        )
        .all(schoolId) as {
        day_name: string;
        hoi: number;
        name: string | null;
        st: string | null;
        et: string | null;
      }[];

      db.prepare('DELETE FROM days WHERE school_id = ?').run(schoolId);
      const insert = db.prepare(
        'INSERT INTO days (school_id, name, order_index) VALUES (?, ?, ?)',
      );
      const newIdByName = new Map<string, number>();
      names.forEach((name, i) => {
        const res = insert.run(schoolId, name, i);
        newIdByName.set(name, Number(res.lastInsertRowid));
      });

      if (savedDayHours.length > 0) {
        const reinsert = db.prepare(
          `INSERT INTO day_hours
             (school_id, day_id, hour_order_index, name, start_time, end_time)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        const seen = new Set<string>();
        for (const r of savedDayHours) {
          const newDayId = newIdByName.get(r.day_name);
          if (newDayId === undefined) continue; // adı kalkan gün → ayarları doğal olarak düşer
          const key = `${newDayId}:${r.hoi}`;
          if (seen.has(key)) continue;
          seen.add(key);
          reinsert.run(schoolId, newDayId, r.hoi, r.name, r.st, r.et);
        }
      }
    });
    trx();
    return this.list();
  },
};
