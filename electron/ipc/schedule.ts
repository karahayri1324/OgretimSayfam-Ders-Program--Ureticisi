import { ipcMain } from 'electron';
import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { dayHoursRepo } from '../db/repositories/day_hours.js';
import { safeHandler, validate } from './_common.js';
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
    return safeHandler('schedule:setDays', () => daysRepo.replaceAll(v.data));
  });

  ipcMain.handle('schedule:setHours', async (_e, raw) => {
    const v = validate(HoursSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('schedule:setHours', () => hoursRepo.replaceAll(v.data));
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
        const next = adjustHours(cur, deltaMinutes, mode);
        hoursRepo.replaceAll(
          next.map((h) => ({ name: h.name, startTime: h.startTime, endTime: h.endTime })),
        );
        return { days: daysRepo.list(), hours: hoursRepo.list(), dayHours: dayHoursRepo.list() };
      }

      const globalHours = hoursRepo.list();
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
    const multiplier = mode === 'break' ? i : 1;
    const startShift = mode === 'end' ? 0 : delta * multiplier;
    const endShift = mode === 'start' ? 0 : delta * multiplier;
    return {
      ...h,
      startTime: h.startTime ? shiftClock(h.startTime, startShift) : h.startTime,
      endTime: h.endTime ? shiftClock(h.endTime, endShift) : h.endTime,
    };
  });
}

function shiftClock(time: string, deltaMinutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  let totalMin = hh * 60 + mm + deltaMinutes;
  while (totalMin < 0) totalMin += 24 * 60;
  totalMin = totalMin % (24 * 60);
  const nh = Math.floor(totalMin / 60);
  const nm = totalMin % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

