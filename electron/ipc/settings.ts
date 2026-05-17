import { ipcMain } from 'electron';
import { settingsRepo } from '../db/repositories/settings.js';
import { safeHandler, validate } from './_common.js';
import { SettingsPatchSchema } from './_schemas.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () =>
    safeHandler('settings:get', () => settingsRepo.getAll()),
  );

  ipcMain.handle('settings:set', async (_e, raw) => {
    const v = validate(SettingsPatchSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('settings:set', () => settingsRepo.setMany(v.data));
  });
}
