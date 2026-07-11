import { ipcMain } from 'electron';
import { roomsRepo } from '../db/repositories/rooms.js';
import {
  pruneConstraintsByName,
  renameConstraintReferences,
} from '../db/constraint-maintenance.js';
import { safeHandler, validate, err } from './_common.js';
import { isGenerationActive } from './generate.js';
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
      // Rename cascade — AI yoluyla parite (kısıtlar adı snapshot saklar).
      const renamed =
        v.data.name !== undefined && v.data.name !== existing.name
          ? renameConstraintReferences('room', existing.name, v.data.name)
          : 0;
      return { id, renamedConstraints: renamed };
    });
  });

  ipcMain.handle('rooms:delete', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz derslik kimliği.');
    }
    // Üretim sürerken silme → biterken FK INSERT çökmesi/program kaybı (bkz. teachers.ts).
    if (isGenerationActive()) {
      return err('BUSY', 'Program üretimi sürerken veri silinemez. Üretim bitince (veya iptal edince) tekrar deneyin.');
    }
    return safeHandler('rooms:delete', () => {
      const existing = roomsRepo.get(id);
      if (!existing) throw new Error('Derslik bulunamadı.');
      roomsRepo.delete(id);
      const pruned = pruneConstraintsByName('room', existing.name);
      return { id, prunedConstraints: pruned };
    });
  });
}
