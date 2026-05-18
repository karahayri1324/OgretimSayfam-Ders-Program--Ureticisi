import { daysRepo } from './days.js';
import { hoursRepo } from './hours.js';
import type { Day, Hour } from '../../../src/lib/types.js';

export const scheduleRepo = {
  getDays(): Day[] {
    return daysRepo.list();
  },

  getHours(): Hour[] {
    return hoursRepo.list();
  },

  setDays(names: string[]): Day[] {
    return daysRepo.replaceAll(names);
  },

  setHours(
    hours: Array<{ name: string; startTime?: string | null; endTime?: string | null }>,
  ): Hour[] {
    return hoursRepo.replaceAll(hours);
  },
};
