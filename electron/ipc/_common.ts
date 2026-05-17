import type { ZodError, ZodTypeAny, z } from 'zod';
import { log } from '../utils/logger.js';

export type Ok<T> = { ok: true; data: T };
export type Err = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type Response<T> = Ok<T> | Err;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

export const err = (
  code: string,
  message: string,
  details?: unknown,
): Err => ({
  ok: false,
  error: { code, message, details },
});

/**
 * Handler'ları sarar. Beklenmedik exception'ları DB_ERROR olarak loglar.
 * Türkçe mesaj döner, raw error log dosyasına gider.
 */
export async function safeHandler<T>(
  label: string,
  fn: () => Promise<T> | T,
): Promise<Response<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(`IPC hatası: ${label}`, { error: message, stack: (e as Error)?.stack });

    // SQLite unique constraint vs için CONFLICT döndür
    if (/UNIQUE constraint failed/i.test(message)) {
      return err('CONFLICT', 'Bu kayıt zaten mevcut (benzersizlik ihlali).', message);
    }
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      return err(
        'CONFLICT',
        'Başka kayıtlara bağlı olduğu için bu işlem yapılamadı.',
        message,
      );
    }
    if (/CHECK constraint failed/i.test(message)) {
      return err('VALIDATION', 'Veri kuralları ihlal edildi.', message);
    }
    return err('DB_ERROR', `Veritabanı hatası: ${message}`, message);
  }
}

/**
 * Zod ile input doğrula. Hata varsa Err döner, yoksa parsed datayı.
 */
export function validate<S extends ZodTypeAny>(
  schema: S,
  raw: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; error: Err } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = (parsed.error as ZodError).issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    return {
      ok: false,
      error: err(
        'VALIDATION',
        `Geçersiz veri: ${issues.join('; ')}`,
        parsed.error.flatten(),
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
