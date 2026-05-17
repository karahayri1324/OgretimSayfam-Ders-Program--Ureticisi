import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
};

type State = {
  toasts: ToastItem[];
  push: (kind: ToastKind, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warn: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
};

const DURATION_MS = 4000;

export const useToastStore = create<State>((set, get) => ({
  toasts: [],
  push: (kind, title, description) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t_${Date.now()}_${Math.random()}`;
    set({ toasts: [...get().toasts, { id, kind, title, description }] });
    setTimeout(() => get().dismiss(id), DURATION_MS);
  },
  success: (t, d) => get().push('success', t, d),
  error: (t, d) => get().push('error', t, d),
  info: (t, d) => get().push('info', t, d),
  warn: (t, d) => get().push('warn', t, d),
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
