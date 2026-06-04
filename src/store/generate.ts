import { create } from 'zustand';
import type { GenerateProgress, TimetableResult } from '../lib/types';

type Status = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

type State = {
  status: Status;
  progress: number;
  logs: string[];
  error: string | null;
  result: TimetableResult | null;
  unsubscribe: null | (() => void);
  loadLatest: () => Promise<void>;
  run: (timeLimitSec: number) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
};

export const useGenerateStore = create<State>((set, get) => ({
  status: 'idle',
  progress: 0,
  logs: [],
  error: null,
  result: null,
  unsubscribe: null,

  loadLatest: async () => {
    const res = await window.api.generate.latest();
    if (res.ok && res.data) {
      set({ result: res.data as TimetableResult });
    }
  },

  run: async (timeLimitSec) => {
    get().unsubscribe?.();
    set({
      status: 'running',
      progress: 0,
      logs: [],
      error: null,
      result: null,
    });

    const off = window.api.generate.onProgress((event) => {
      const ev = event as GenerateProgress;
      if (ev.kind === 'progress') {
        set({
          progress: ev.value,
          logs: ev.message
            ? [...get().logs, ev.message]
            : get().logs,
        });
      } else if (ev.kind === 'log') {
        set({ logs: [...get().logs, ev.line] });
      } else if (ev.kind === 'done') {
        set({
          status: 'success',
          progress: 100,
          result: ev.result,
        });
        get().unsubscribe?.();
        set({ unsubscribe: null });
      } else if (ev.kind === 'error') {
        set({ status: 'error', error: ev.message });
        get().unsubscribe?.();
        set({ unsubscribe: null });
      }
    });
    set({ unsubscribe: off });

    const res = await window.api.generate.run({ timeLimitSec });
    if (!res.ok) {
      set({
        status: 'error',
        error: res.error.message,
      });
      get().unsubscribe?.();
      set({ unsubscribe: null });
    }
  },

  cancel: async () => {
    // Önce senkron olarak dinleyiciyi kaldır + durumu işaretle: IPC round-trip sırasında
    // gelecek geç bir 'done'/'error' olayı iptal durumunu ezmesin.
    get().unsubscribe?.();
    set({ status: 'cancelled', unsubscribe: null });
    await window.api.generate.cancel();
  },

  reset: () => {
    get().unsubscribe?.();
    set({
      status: 'idle',
      progress: 0,
      logs: [],
      error: null,
      result: null,
      unsubscribe: null,
    });
  },
}));
