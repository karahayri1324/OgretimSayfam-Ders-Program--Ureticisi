import { ipcMain } from 'electron';
import { constraintsRepo } from '../db/repositories/constraints.js';
import { safeHandler, validate, err } from './_common.js';
import { ConstraintInputSchema } from './_schemas.js';

export function registerConstraintsHandlers(): void {
  ipcMain.handle('constraints:list', async () =>
    safeHandler('constraints:list', () => constraintsRepo.list()),
  );

  ipcMain.handle('constraints:add', async (_e, raw) => {
    const v = validate(ConstraintInputSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('constraints:add', () => {
      const id = constraintsRepo.add(v.data);
      return { id };
    });
  });

  ipcMain.handle('constraints:delete', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz kısıtlama kimliği.');
    }
    return safeHandler('constraints:delete', () => {
      constraintsRepo.delete(id);
      return { id };
    });
  });

  ipcMain.handle(
    'constraints:toggle',
    async (_e, id: number, active: boolean) => {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
        return err('VALIDATION', 'Geçersiz kısıtlama kimliği.');
      }
      if (typeof active !== 'boolean') {
        return err('VALIDATION', 'Aktiflik değeri boolean olmalı.');
      }
      return safeHandler('constraints:toggle', () => {
        constraintsRepo.toggle(id, active);
        return { id, active };
      });
    },
  );

  ipcMain.handle(
    'constraints:setWeight',
    async (_e, id: number, weight: number) => {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
        return err('VALIDATION', 'Geçersiz kısıtlama kimliği.');
      }
      if (typeof weight !== 'number' || !Number.isFinite(weight)) {
        return err('VALIDATION', 'Ağırlık 0-100 arası bir sayı olmalı.');
      }
      const w = Math.max(0, Math.min(100, Math.floor(weight)));
      return safeHandler('constraints:setWeight', () => {
        constraintsRepo.setWeight(id, w);
        return { id, weight: w };
      });
    },
  );
}
