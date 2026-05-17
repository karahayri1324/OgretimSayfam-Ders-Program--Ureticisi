import { ipcMain } from 'electron';
import { z } from 'zod';
import { classesRepo } from '../db/repositories/classes.js';
import { classYearsRepo } from '../db/repositories/class_years.js';
import { safeHandler, validate, err } from './_common.js';
import { ClassInputSchema, ClassPatchSchema } from './_schemas.js';

const YearCreateSchema = z.object({
  kind: z.literal('year'),
  name: z.string().trim().min(1, 'Düzey adı boş olamaz'),
  orderIndex: z.number().int().min(0).optional(),
});

const YearPatchSchema = z.object({
  kind: z.literal('year'),
  name: z.string().trim().min(1).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

function isYearPayload(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { kind?: unknown }).kind === 'year'
  );
}

function stripKind(raw: unknown): unknown {
  if (typeof raw === 'object' && raw !== null) {
    const copy = { ...(raw as Record<string, unknown>) };
    delete copy.kind;
    return copy;
  }
  return raw;
}

export function registerClassesHandlers(): void {
  ipcMain.handle('classes:list', async () =>
    safeHandler('classes:list', () => ({
      years: classYearsRepo.list(),
      classes: classesRepo.list(),
    })),
  );

  ipcMain.handle('classes:create', async (_e, raw) => {
    if (isYearPayload(raw)) {
      const v = validate(YearCreateSchema, raw);
      if (!v.ok) return v.error;
      return safeHandler('classes:create:year', () => {
        const id = classYearsRepo.create(v.data.name, v.data.orderIndex);
        return { id, kind: 'year' as const };
      });
    }
    const v = validate(ClassInputSchema, stripKind(raw));
    if (!v.ok) return v.error;
    return safeHandler('classes:create', () => {
      const id = classesRepo.create(v.data);
      return { id, kind: 'class' as const };
    });
  });

  ipcMain.handle('classes:update', async (_e, id: number, raw) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
      return err('VALIDATION', 'Geçersiz kimlik.');
    }
    if (isYearPayload(raw)) {
      const v = validate(YearPatchSchema, raw);
      if (!v.ok) return v.error;
      return safeHandler('classes:update:year', () => {
        const existing = classYearsRepo.get(id);
        if (!existing) throw new Error('Düzey bulunamadı.');
        classYearsRepo.update(id, {
          name: v.data.name,
          orderIndex: v.data.orderIndex,
        });
        return { id, kind: 'year' as const };
      });
    }
    const v = validate(ClassPatchSchema, stripKind(raw));
    if (!v.ok) return v.error;
    return safeHandler('classes:update', () => {
      const existing = classesRepo.get(id);
      if (!existing) throw new Error('Sınıf bulunamadı.');
      classesRepo.update(id, v.data);
      return { id, kind: 'class' as const };
    });
  });

  ipcMain.handle(
    'classes:delete',
    async (_e, id: number, opts?: { kind?: string }) => {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
        return err('VALIDATION', 'Geçersiz kimlik.');
      }
      return safeHandler('classes:delete', () => {
        if (opts?.kind === 'year') {
          classYearsRepo.delete(id);
          return { id, kind: 'year' as const };
        }
        classesRepo.delete(id);
        return { id, kind: 'class' as const };
      });
    },
  );
}
