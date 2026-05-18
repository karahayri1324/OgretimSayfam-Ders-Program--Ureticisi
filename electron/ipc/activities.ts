import { ipcMain } from 'electron';
import { activitiesRepo } from '../db/repositories/activities.js';
import { safeHandler, validate, err } from './_common.js';
import { ActivityInputSchema, SetSplitSchema } from './_schemas.js';

export function registerActivitiesHandlers(): void {
  ipcMain.handle('activities:list', async () =>
    safeHandler('activities:list', () => activitiesRepo.list()),
  );

  ipcMain.handle('activities:upsert', async (_e, raw) => {
    const v = validate(ActivityInputSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('activities:upsert', () => {
      const id = activitiesRepo.upsert(v.data);
      return { id };
    });
  });

  ipcMain.handle('activities:delete', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz aktivite kimliği.');
    }
    return safeHandler('activities:delete', () => {
      activitiesRepo.delete(id);
      return { id };
    });
  });

  ipcMain.handle('activities:setSplit', async (_e, raw) => {
    const v = validate(SetSplitSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('activities:setSplit', () => {
      const groupId = activitiesRepo.setSplitGroup(v.data.activityIds);
      return { groupId };
    });
  });

  ipcMain.handle('activities:clearSplit', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz aktivite kimliği.');
    }
    return safeHandler('activities:clearSplit', () => {
      activitiesRepo.clearSplitGroup(id);
      return { id };
    });
  });
}
