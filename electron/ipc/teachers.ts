import { ipcMain } from 'electron';
import { teachersRepo } from '../db/repositories/teachers.js';
import { safeHandler, validate, err } from './_common.js';
import { isGenerationActive } from './generate.js';
import { TeacherInputSchema, TeacherPatchSchema } from './_schemas.js';

// Canlı FET üretimi sürerken entity silmek, üretim biterken sonucun artık var olmayan id'lere
// FK INSERT yapıp TÜM programı kaybetmesine yol açar (ai:applyMutations için zaten guard var,
// doğrudan UI silme yolları da aynı şekilde korunmalı). Ortak mesaj.
const GEN_BUSY_MSG =
  'Program üretimi sürerken veri silinemez. Üretim bitince (veya iptal edince) tekrar deneyin.';

export function registerTeachersHandlers(): void {
  ipcMain.handle('teachers:list', async () =>
    safeHandler('teachers:list', () => teachersRepo.list()),
  );

  ipcMain.handle('teachers:create', async (_e, raw) => {
    const v = validate(TeacherInputSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('teachers:create', () => {
      const id = teachersRepo.create(v.data);
      return { id };
    });
  });

  ipcMain.handle('teachers:update', async (_e, id: number, raw) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz öğretmen kimliği.');
    }
    const v = validate(TeacherPatchSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('teachers:update', () => {
      const existing = teachersRepo.get(id);
      if (!existing) throw new Error('Öğretmen bulunamadı.');
      teachersRepo.update(id, v.data);
      return { id };
    });
  });

  ipcMain.handle('teachers:delete', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz öğretmen kimliği.');
    }
    if (isGenerationActive()) return err('BUSY', GEN_BUSY_MSG);
    return safeHandler('teachers:delete', () => {
      teachersRepo.delete(id);
      return { id };
    });
  });
}
