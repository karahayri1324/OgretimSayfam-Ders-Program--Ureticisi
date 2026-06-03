import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  AuthError,
  getSession,
  login,
  logout,
  register,
  type SessionUser,
  type SessionView,
} from '../auth/session.js';
import { validate } from './_common.js';
import { log } from '../utils/logger.js';
import type { Result } from '../../src/lib/types.js';

const RegisterSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin.'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı.'),
  name: z.string().trim().max(200).optional().nullable(),
  school: z.string().trim().max(200).optional().nullable(),
});

const LoginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin.'),
  password: z.string().min(1, 'Şifre boş olamaz.'),
});

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:status', async (): Promise<Result<SessionView>> => {
    try {
      return { ok: true, data: getSession() };
    } catch {
      return { ok: true, data: { authed: false, user: null } };
    }
  });

  ipcMain.handle('auth:register', async (_e, raw): Promise<Result<SessionUser>> => {
    const v = validate(RegisterSchema, raw);
    if (!v.ok) return v.error;
    try {
      const user = await register(v.data);
      return { ok: true, data: user };
    } catch (e) {
      const code = e instanceof AuthError ? e.code : 'AUTH_ERROR';
      const message = e instanceof Error ? e.message : 'Kayıt başarısız.';
      log.warn('Kayıt hatası', { code, message });
      return { ok: false, error: { code, message } };
    }
  });

  ipcMain.handle('auth:login', async (_e, raw): Promise<Result<SessionUser>> => {
    const v = validate(LoginSchema, raw);
    if (!v.ok) return v.error;
    try {
      const user = await login(v.data);
      return { ok: true, data: user };
    } catch (e) {
      const code = e instanceof AuthError ? e.code : 'AUTH_ERROR';
      const message = e instanceof Error ? e.message : 'Giriş başarısız.';
      log.warn('Giriş hatası', { code, message });
      return { ok: false, error: { code, message } };
    }
  });

  ipcMain.handle('auth:logout', async (): Promise<Result<null>> => {
    try {
      logout();
      return { ok: true, data: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: 'AUTH_ERROR', message } };
    }
  });
}
