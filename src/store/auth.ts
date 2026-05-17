import { create } from 'zustand';

/**
 * Basit local auth state — şimdilik gerçek backend yok.
 * Guest modu test için, login/register placeholder.
 * Kararlar localStorage'a yazılır ki refresh'te giriş ekranı tekrar gelmesin.
 */

const STORAGE_KEY = 'osf-auth-v1';

type Persisted = {
  authed: boolean;
  guest: boolean;
  email: string | null;
  name: string | null;
};

function read(): Persisted {
  if (typeof window === 'undefined') {
    return { authed: false, guest: false, email: null, name: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { authed: false, guest: false, email: null, name: null };
    const parsed = JSON.parse(raw);
    return {
      authed: Boolean(parsed.authed),
      guest: Boolean(parsed.guest),
      email: typeof parsed.email === 'string' ? parsed.email : null,
      name: typeof parsed.name === 'string' ? parsed.name : null,
    };
  } catch {
    return { authed: false, guest: false, email: null, name: null };
  }
}

function write(s: Persisted) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // sessizce yut
  }
}

type AuthState = {
  authed: boolean;
  guest: boolean;
  email: string | null;
  name: string | null;
  /** Test/placeholder login — gerçek backend gelene kadar her şeyi kabul ediyor. */
  login: (email: string, _password: string) => Promise<void>;
  /** Test/placeholder register. */
  register: (name: string, email: string, _password: string) => Promise<void>;
  /** Misafir devam — local-only çalış. */
  continueAsGuest: () => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => {
  const initial = read();
  return {
    ...initial,
    login: async (email) => {
      const next = { authed: true, guest: false, email, name: null };
      set(next);
      write(next);
    },
    register: async (name, email) => {
      const next = { authed: true, guest: false, email, name };
      set(next);
      write(next);
    },
    continueAsGuest: () => {
      const next = { authed: false, guest: true, email: null, name: null };
      set(next);
      write(next);
    },
    logout: () => {
      const next = { authed: false, guest: false, email: null, name: null };
      set(next);
      write(next);
    },
  };
});
