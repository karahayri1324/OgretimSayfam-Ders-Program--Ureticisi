import { ipcMain } from 'electron';
import { roomsRepo } from '../db/repositories/rooms.js';
import { safeHandler, validate, err } from './_common.js';
import { RoomInputSchema, RoomPatchSchema } from './_schemas.js';

export function registerRoomsHandlers(): void {
  ipcMain.handle('rooms:list', async () =>
    safeHandler('rooms:list', () => roomsRepo.list()),
  );

  ipcMain.handle('rooms:create', async (_e, raw) => {
    const v = validate(RoomInputSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('rooms:create', () => {
      const id = roomsRepo.create(v.data);
      return { id };
    });
  });

  ipcMain.handle('rooms:update', async (_e, id: number, raw) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz derslik kimliği.');
    }
    const v = validate(RoomPatchSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('rooms:update', () => {
      const existing = roomsRepo.get(id);
      if (!existing) throw new Error('Derslik bulunamadı.');
      roomsRepo.update(id, v.data);
      return { id };
    });
  });

  ipcMain.handle('rooms:delete', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz derslik kimliği.');
    }
    return safeHandler('rooms:delete', () => {
      roomsRepo.delete(id);
      return { id };
    });
  });
}
