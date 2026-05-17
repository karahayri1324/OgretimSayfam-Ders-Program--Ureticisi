import { create } from 'zustand';
import type { Day, DayHour, DayHourInput, Hour } from '../lib/types';

type State = {
  days: Day[];
  hours: Hour[];
  dayHours: DayHour[];
  loading: boolean;
  load: () => Promise<void>;
  saveDays: (days: Pick<Day, 'name' | 'orderIndex'>[]) => Promise<boolean>;
  saveHours: (
    hours: Pick<Hour, 'name' | 'orderIndex' | 'startTime' | 'endTime'>[],
  ) => Promise<boolean>;
  saveDayHours: (dayId: number, entries: DayHourInput[]) => Promise<boolean>;
  clearDayHours: (dayId: number) => Promise<boolean>;
  bulkAdjustBreaks: (
    deltaMinutes: number,
    mode: 'start' | 'end' | 'break',
    dayIds?: number[],
  ) => Promise<boolean>;
};

type ScheduleResponse = {
  days?: Day[];
  hours?: Hour[];
  dayHours?: DayHour[];
};

function applyResponse(set: (s: Partial<State>) => void, data: ScheduleResponse): void {
  set({
    days: data.days ?? [],
    hours: data.hours ?? [],
    dayHours: data.dayHours ?? [],
  });
}

export const useScheduleStore = create<State>((set) => ({
  days: [],
  hours: [],
  dayHours: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.schedule.get();
    if (res.ok) applyResponse(set, res.data as ScheduleResponse);
    set({ loading: false });
  },

  saveDays: async (days) => {
    const res = await window.api.schedule.setDays(days);
    if (res.ok) {
      const refreshed = await window.api.schedule.get();
      if (refreshed.ok) applyResponse(set, refreshed.data as ScheduleResponse);
      return true;
    }
    return false;
  },

  saveHours: async (hours) => {
    const res = await window.api.schedule.setHours(hours);
    if (res.ok) {
      const refreshed = await window.api.schedule.get();
      if (refreshed.ok) applyResponse(set, refreshed.data as ScheduleResponse);
      return true;
    }
    return false;
  },

  saveDayHours: async (dayId, entries) => {
    const res = await window.api.schedule.setDayHours(dayId, entries);
    if (res.ok) {
      const refreshed = await window.api.schedule.get();
      if (refreshed.ok) applyResponse(set, refreshed.data as ScheduleResponse);
      return true;
    }
    return false;
  },

  clearDayHours: async (dayId) => {
    const res = await window.api.schedule.clearDayHours(dayId);
    if (res.ok) {
      const refreshed = await window.api.schedule.get();
      if (refreshed.ok) applyResponse(set, refreshed.data as ScheduleResponse);
      return true;
    }
    return false;
  },

  bulkAdjustBreaks: async (deltaMinutes, mode, dayIds) => {
    const res = await window.api.schedule.bulkAdjustBreaks({
      deltaMinutes,
      mode,
      dayIds,
    });
    if (res.ok) {
      applyResponse(set, res.data as ScheduleResponse);
      return true;
    }
    return false;
  },
}));
