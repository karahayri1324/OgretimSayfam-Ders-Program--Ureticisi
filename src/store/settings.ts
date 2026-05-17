import { create } from 'zustand';

export type AppSettings = {
  aiEndpoint: string;
  aiTimeoutSec: number;
  fetTimeLimitSec: number;
  theme: 'light' | 'dark';
} & Record<string, unknown>;

const DEFAULTS: AppSettings = {
  aiEndpoint: 'mock://local',
  aiTimeoutSec: 30,
  fetTimeLimitSec: 120,
  theme: 'light',
};

type State = {
  settings: AppSettings;
  loading: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<boolean>;
};

function coerce(raw: Record<string, unknown>): AppSettings {
  const next: AppSettings = { ...DEFAULTS, ...raw };
  if (typeof next.aiTimeoutSec === 'string')
    next.aiTimeoutSec = Number(next.aiTimeoutSec) || DEFAULTS.aiTimeoutSec;
  if (typeof next.fetTimeLimitSec === 'string')
    next.fetTimeLimitSec = Number(next.fetTimeLimitSec) || DEFAULTS.fetTimeLimitSec;
  if (next.theme !== 'light' && next.theme !== 'dark') next.theme = 'light';
  return next;
}

export const useSettingsStore = create<State>((set, get) => ({
  settings: DEFAULTS,
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.settings.get();
    if (res.ok) {
      set({ settings: coerce(res.data as Record<string, unknown>) });
    }
    set({ loading: false });
  },

  update: async (patch) => {
    const res = await window.api.settings.set(patch);
    if (res.ok) {
      set({ settings: { ...get().settings, ...patch } });
      return true;
    }
    return false;
  },
}));
