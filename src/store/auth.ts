import { create } from 'zustand';
import { useAIChatStore } from './ai-chat';
import { useGenerateStore } from './generate';

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  school: string | null;
  status: string;
  isAdmin: boolean;
};

type AuthState = {
  authed: boolean;
  ready: boolean;
  user: AuthUser | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name?: string;
    school?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  authed: false,
  ready: false,
  user: null,

  init: async () => {
    try {
      const res = await window.api.auth.status();
      if (res.ok && res.data.authed) {
        set({ authed: true, user: (res.data.user as AuthUser) ?? null, ready: true });
        return;
      }
    } catch {
    }
    set({ authed: false, user: null, ready: true });
  },

  login: async (email, password) => {
    const res = await window.api.auth.login({ email, password });
    if (!res.ok) throw new Error(res.error.message);
    set({ authed: true, user: res.data as AuthUser });
  },

  register: async (input) => {
    const res = await window.api.auth.register(input);
    if (!res.ok) throw new Error(res.error.message);
    set({ authed: true, user: res.data as AuthUser });
  },

  logout: async () => {
    try {
      await window.api.auth.logout();
    } finally {
      set({ authed: false, user: null });
      try {
        useAIChatStore.getState().clear();
        useGenerateStore.getState().reset();
      } catch {
      }
    }
  },
}));
