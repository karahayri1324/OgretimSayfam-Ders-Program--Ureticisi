import { ipcMain } from 'electron';
import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { dayHoursRepo } from '../db/repositories/day_hours.js';
import { safeHandler, validate } from './_common.js';
import { shiftClock, shiftsFor, adjustOverflows } from '../utils/clock.js';
import {
  pruneFixedTimeLocksBeyondHour,
  pruneConstraintsForRemovedDays,
} from '../db/constraint-maintenance.js';
import {
  BulkAdjustBreaksSchema,
  DaysSchema,
  HoursSchema,
  SetDayHoursSchema,
} from './_schemas.js';
import type { Hour } from '../../src/lib/types.js';

export function registerScheduleHandlers(): void {
  ipcMain.handle('schedule:get', async () =>
    safeHandler('schedule:get', () => ({
      days: daysRepo.list(),
      hours: hoursRepo.list(),
      dayHours: dayHoursRepo.list(),
    })),
  );

  ipcMain.handle('schedule:setDays', async (_e, raw) => {
    const v = validate(DaysSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('schedule:setDays', () => {
      // Gün KALDIRILIRSA o güne bağlı kısıtlar (kilit/müsaitlik/ders-yasak) aksi halde FET-build'de
      // sessizce skip edilirdi (AI delete_day/set_days yolundaki korumanın manuel karşılığı).
      const before = daysRepo.list().map((d) => d.name);
      const result = daysRepo.replaceAll(v.data);
      const norm = (s: string) => s.trim().toLocaleLowerCase('tr');
      const removed = before.filter((d) => !v.data.some((n) => norm(n) === norm(d)));
      if (removed.length > 0) pruneConstraintsForRemovedDays(removed);
      return result;
    });
  });

  ipcMain.handle('schedule:setHours', async (_e, raw) => {
    const v = validate(HoursSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('schedule:setHours', () => {
      const result = hoursRepo.replaceAll(v.data);
      // Saat sayısı azaldıysa aralık-dışı ACTIVITY_FIXED_TIME kilitleri sessizce düşerdi (AI
      // set_hours_per_day/set_hour_times yolundaki korumanın manuel karşılığı). No-op if artmışsa.
      pruneFixedTimeLocksBeyondHour(v.data.length);
      return result;
    });
  });

  ipcMain.handle('schedule:setDayHours', async (_e, raw) => {
    const v = validate(SetDayHoursSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('schedule:setDayHours', () =>
      dayHoursRepo.replaceForDay(v.data.dayId, v.data.entries),
    );
  });

  ipcMain.handle('schedule:clearDayHours', async (_e, dayId: number) => {
    if (typeof dayId !== 'number' || !Number.isInteger(dayId) || dayId < 1) {
      return { ok: false as const, error: { code: 'VALIDATION', message: 'Geçersiz gün kimliği.' } };
    }
    return safeHandler('schedule:clearDayHours', () =>
      dayHoursRepo.replaceForDay(dayId, []),
    );
  });

  ipcMain.handle('schedule:bulkAdjustBreaks', async (_e, raw) => {
    const v = validate(BulkAdjustBreaksSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('schedule:bulkAdjustBreaks', () => {
      const { deltaMinutes, mode, dayIds } = v.data;

      if (!dayIds || dayIds.length === 0) {
        const cur = hoursRepo.list();
        assertAdjustValid(cur, deltaMinutes, mode);
        const next = adjustHours(cur, deltaMinutes, mode);
        hoursRepo.replaceAll(
          next.map((h) => ({ name: h.name, startTime: h.startTime, endTime: h.endTime })),
        );
        return { days: daysRepo.list(), hours: hoursRepo.list(), dayHours: dayHoursRepo.list() };
      }

      const globalHours = hoursRepo.list();
      // İki fazlı: ÖNCE tüm günlerin baseline'ını kur + doğrula (taşma/çakışma varsa hiç yazma),
      // SONRA yaz — aksi halde bir gün geçerli yazılıp sonraki günde hata kısmi/tutarsız bırakırdı.
      const plan: Array<{ dayId: number; baseline: HourLike[] }> = [];
      for (const dayId of dayIds) {
        const existing = dayHoursRepo.listByDay(dayId);
        const baseline: HourLike[] =
          existing.length > 0
            ? existing.map((d) => ({
                name: d.name ?? '',
                orderIndex: d.orderIndex,
                startTime: d.startTime,
                endTime: d.endTime,
              }))
            : globalHours.map((h) => ({
                name: h.name,
                orderIndex: h.orderIndex,
                startTime: h.startTime,
                endTime: h.endTime,
              }));
        assertAdjustValid(baseline, deltaMinutes, mode);
        plan.push({ dayId, baseline });
      }
      for (const { dayId, baseline } of plan) {
        const next = adjustHours(baseline, deltaMinutes, mode);
        dayHoursRepo.replaceForDay(
          dayId,
          next.map((h) => ({
            orderIndex: h.orderIndex,
            name: h.name || null,
            startTime: h.startTime,
            endTime: h.endTime,
          })),
        );
      }
      return { days: daysRepo.list(), hours: hoursRepo.list(), dayHours: dayHoursRepo.list() };
    });
  });
}

type HourLike = Pick<Hour, 'name' | 'orderIndex' | 'startTime' | 'endTime'>;

function adjustHours(
  hours: HourLike[],
  delta: number,
  mode: 'start' | 'end' | 'break',
): HourLike[] {
  return hours.map((h, i) => {
    const { startShift, endShift } = shiftsFor(i, delta, mode);
    return {
      ...h,
      startTime: h.startTime ? shiftClock(h.startTime, startShift) : h.startTime,
      endTime: h.endTime ? shiftClock(h.endTime, endShift) : h.endTime,
    };
  });
}

// Kaydırma uygulanmadan ÖNCE geçerlilik denetimi (shiftClock sessizce clamp'lediği için).
// AI yolundaki (schedule-executor extendBreaks) shiftInvalid guard'ının manuel karşılığı —
// taşma/çakışma varsa yazma yapılmadan hata fırlatılır. adjustOverflows artık ortak clock modülünde.
function assertAdjustValid(
  hours: HourLike[],
  delta: number,
  mode: 'start' | 'end' | 'break',
): void {
  if (adjustOverflows(hours, delta, mode)) {
    throw new Error(
      delta > 0
        ? 'Bu kadar kaydırma günü (24 saat) taşırıyor veya dersleri çakıştırıyor; daha küçük bir değer deneyin.'
        : 'Bu kadar kaydırma dersleri çakıştırıyor veya geçersiz saate düşürüyor; daha küçük bir değer deneyin.',
    );
  }
}

