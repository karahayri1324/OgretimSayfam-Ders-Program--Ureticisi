import axios, { AxiosError } from 'axios';
import { API_BASE } from '../config.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { log } from '../utils/logger.js';

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  school: string | null;
  status: string;
  isAdmin: boolean;
};

export type SessionView = {
  authed: boolean;
  user: SessionUser | null;
};

export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}

export type RegisterInput = {
  email: string;
  password: string;
  name?: string | null;
  school?: string | null;
};

export type LoginInput = { email: string; password: string; remember?: boolean };

// "Bu cihazda oturumumu açık tut" KAPALI iken token yalnız bellekte tutulur (kalıcı DB'ye
// yazılmaz); uygulama yeniden açılınca oturum kapanır (#7). Eskiden onay kutusu yok sayılıp
// her zaman kalıcı saklanıyordu.
let memToken: string | null = null;
let memUser: SessionUser | null = null;

function persist(token: string, user: SessionUser, remember: boolean): void {
  memToken = token;
  memUser = user;
  if (remember) {
    settingsRepo.setMany({
      [TOKEN_KEY]: token,
      [USER_KEY]: JSON.stringify(user),
    });
  } else {
    // Önceden "hatırla" ile kalmış kalıcı token varsa temizle ki kapanışta oturum gerçekten bitsin.
    settingsRepo.setMany({ [TOKEN_KEY]: '', [USER_KEY]: '' });
  }
}

export function clearSession(): void {
  memToken = null;
  memUser = null;
  settingsRepo.setMany({ [TOKEN_KEY]: '', [USER_KEY]: '' });
}

export function getToken(): string | null {
  if (memToken && memToken.trim()) return memToken.trim();
  try {
    const v = settingsRepo.get(TOKEN_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function normalizeUser(raw: unknown): SessionUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.email !== 'string') return null;
  return {
    id: typeof u.id === 'number' ? u.id : 0,
    email: u.email,
    name: typeof u.name === 'string' ? u.name : null,
    school: typeof u.school === 'string' ? u.school : null,
    status: typeof u.status === 'string' ? u.status : 'active',
    isAdmin: Boolean(u.is_admin ?? u.isAdmin),
  };
}

export function getSession(): SessionView {
  if (memToken && memToken.trim()) {
    return { authed: true, user: memUser };
  }
  const token = getToken();
  if (!token) return { authed: false, user: null };
  try {
    const rawUser = settingsRepo.get(USER_KEY);
    const user = rawUser ? normalizeUser(JSON.parse(rawUser)) : null;
    return { authed: true, user };
  } catch {
    return { authed: true, user: null };
  }
}

function mapAuthError(e: unknown, fallback: string): AuthError {
  const ax = e as AxiosError<{ error?: string; message?: string }>;
  if (ax.code === 'ECONNABORTED') {
    return new AuthError('TIMEOUT', 'Sunucu yanıt vermedi (zaman aşımı).');
  }
  const status = ax.response?.status;
  const serverMsg = ax.response?.data?.message;
  if (status === 401) {
    return new AuthError('INVALID_CREDENTIALS', serverMsg || 'E-posta veya şifre hatalı.');
  }
  if (status === 409) {
    return new AuthError('EMAIL_EXISTS', serverMsg || 'Bu e-posta zaten kayıtlı.');
  }
  if (status === 422) {
    return new AuthError('VALIDATION', serverMsg || 'Bilgileri kontrol edin.');
  }
  if (typeof status === 'number') {
    return new AuthError('SERVER', serverMsg || `Sunucu hatası (HTTP ${status}).`);
  }
  return new AuthError('NETWORK', `${fallback} (${ax.message ?? 'bağlantı hatası'})`);
}

async function postAuth(
  path: string,
  body: Record<string, unknown>,
): Promise<{ token: string; user: SessionUser }> {
  const res = await axios.post(`${API_BASE}${path}`, body, {
    timeout: 20_000,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = res.data as { token?: string; user?: unknown };
  const user = normalizeUser(data.user);
  if (!data.token || !user) {
    throw new AuthError('SERVER', 'Sunucudan geçersiz yanıt alındı.');
  }
  return { token: data.token, user };
}

export async function register(input: RegisterInput): Promise<SessionUser> {
  try {
    const { token, user } = await postAuth('/v1/auth/register', {
      email: input.email,
      password: input.password,
      name: input.name ?? null,
      school: input.school ?? null,
    });
    persist(token, user, true);
    log.info('Kayıt başarılı', { email: user.email });
    return user;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw mapAuthError(e, 'Kayıt başarısız');
  }
}

export async function login(input: LoginInput): Promise<SessionUser> {
  try {
    const { token, user } = await postAuth('/v1/auth/login', {
      email: input.email,
      password: input.password,
    });
    persist(token, user, input.remember ?? true);
    log.info('Giriş başarılı', { email: user.email });
    return user;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw mapAuthError(e, 'Giriş başarısız');
  }
}

export function logout(): void {
  clearSession();
  log.info('Oturum kapatıldı');
}
