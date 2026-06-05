import { ipcMain } from 'electron';
import { subjectsRepo } from '../db/repositories/subjects.js';
import { safeHandler, validate, err } from './_common.js';
import { isGenerationActive } from './generate.js';
import { SubjectInputSchema, SubjectPatchSchema } from './_schemas.js';

export function registerSubjectsHandlers(): void {
  ipcMain.handle('subjects:list', async () =>
    safeHandler('subjects:list', () => subjectsRepo.list()),
  );

  ipcMain.handle('subjects:create', async (_e, raw) => {
    const v = validate(SubjectInputSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('subjects:create', () => {
      const id = subjectsRepo.create(v.data);
      return { id };
    });
  });

  ipcMain.handle('subjects:update', async (_e, id: number, raw) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz ders kimliği.');
    }
    const v = validate(SubjectPatchSchema, raw);
    if (!v.ok) return v.error;
    return safeHandler('subjects:update', () => {
      const existing = subjectsRepo.get(id);
      if (!existing) throw new Error('Ders bulunamadı.');
      subjectsRepo.update(id, v.data);
      return { id };
    });
  });

  ipcMain.handle('subjects:delete', async (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz ders kimliği.');
    }
    // Üretim sürerken silme → biterken FK INSERT çökmesi/program kaybı (bkz. teachers.ts).
    if (isGenerationActive()) {
      return err('BUSY', 'Program üretimi sürerken veri silinemez. Üretim bitince (veya iptal edince) tekrar deneyin.');
    }
    return safeHandler('subjects:delete', () => {
      subjectsRepo.delete(id);
      return { id };
    });
  });
}
