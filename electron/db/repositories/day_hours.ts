import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { DayHour } from '../../../src/lib/types.js';

type DayHourRow = {
  id: number;
  day_id: number;
  hour_order_index: number;
  name: string | null;
  start_time: string | null;
  end_time: string | null;
};

function rowToDayHour(r: DayHourRow): DayHour {
  return {
    id: r.id,
    dayId: r.day_id,
    orderIndex: r.hour_order_index,
    name: r.name,
    startTime: r.start_time,
    endTime: r.end_time,
  };
}

export type DayHourInput = {
  orderIndex: number;
  name?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export const dayHoursRepo = {
  /** Tüm okulun (aktif) günlere özel saat satırlarını döner. */
  list(): DayHour[] {
    const rows = getDb()
      .prepare(
        `SELECT id, day_id, hour_order_index, name, start_time, end_time
         FROM day_hours WHERE school_id = ?
         ORDER BY day_id ASC, hour_order_index ASC`,
      )
      .all(schoolsRepo.getActiveId()) as DayHourRow[];
    return rows.map(rowToDayHour);
  },

  /** Sadece belirli bir gün için saatler. */
  listByDay(dayId: number): DayHour[] {
    const rows = getDb()
      .prepare(
        `SELECT id, day_id, hour_order_index, name, start_time, end_time
         FROM day_hours WHERE school_id = ? AND day_id = ?
         ORDER BY hour_order_index ASC`,
      )
      .all(schoolsRepo.getActiveId(), dayId) as DayHourRow[];
    return rows.map(rowToDayHour);
  },

  /**
   * Bir günün tüm saatlerini ver(ilen) liste ile değiştirir.
   * Boş liste → o günün day_hours kayıtları silinir (global hours fallback).
   */
  replaceForDay(dayId: number, entries: DayHourInput[]): DayHour[] {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      db.prepare(
        'DELETE FROM day_hours WHERE school_id = ? AND day_id = ?',
      ).run(schoolId, dayId);
      const insert = db.prepare(
        `INSERT INTO day_hours
           (school_id, day_id, hour_order_index, name, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      entries.forEach((e, i) =>
        insert.run(
          schoolId,
          dayId,
          e.orderIndex ?? i,
          e.name ?? null,
          e.startTime ?? null,
          e.endTime ?? null,
        ),
      );
    });
    trx();
    return this.listByDay(dayId);
  },

  /** Tüm günler için tek seferde değiştirir (boş günler reset). */
  replaceAll(map: { dayId: number; entries: DayHourInput[] }[]): DayHour[] {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      db.prepare('DELETE FROM day_hours WHERE school_id = ?').run(schoolId);
      const insert = db.prepare(
        `INSERT INTO day_hours
           (school_id, day_id, hour_order_index, name, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const { dayId, entries } of map) {
        entries.forEach((e, i) =>
          insert.run(
            schoolId,
            dayId,
            e.orderIndex ?? i,
            e.name ?? null,
            e.startTime ?? null,
            e.endTime ?? null,
          ),
        );
      }
    });
    trx();
    return this.list();
  },

  /** Aktif okulun tüm günlere ait day_hours kayıtlarını siler. */
  clearAll(): void {
    getDb()
      .prepare('DELETE FROM day_hours WHERE school_id = ?')
      .run(schoolsRepo.getActiveId());
  },
};
