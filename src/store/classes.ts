import { create } from 'zustand';
import type { ClassInput, ClassRoom, ClassYear } from '../lib/types';

type ListShape =
  | { years: ClassYear[]; classes: ClassRoom[] }
  | ClassRoom[];

type State = {
  years: ClassYear[];
  classes: ClassRoom[];
  loading: boolean;
  lastError: string | null;
  load: () => Promise<void>;
  createClass: (input: ClassInput) => Promise<boolean>;
  updateClass: (id: number, input: ClassInput) => Promise<boolean>;
  removeClass: (id: number) => Promise<boolean>;
  createYear: (name: string, orderIndex?: number) => Promise<boolean>;
  updateYear: (id: number, name: string) => Promise<boolean>;
  removeYear: (id: number) => Promise<boolean>;
};

type IpcErr = { ok: false; error: { code: string; message: string } };
function ipcErrMessage(res: unknown): string | null {
  const r = res as IpcErr | { ok: true };
  if (r.ok) return null;
  const err = (r as IpcErr).error;
  if (!err) return null;
  return err.message ?? null;
}

function normalize(data: ListShape): { years: ClassYear[]; classes: ClassRoom[] } {
  if (Array.isArray(data)) return { years: [], classes: data };
  return { years: data.years ?? [], classes: data.classes ?? [] };
}

export const useClassesStore = create<State>((set, get) => ({
  years: [],
  classes: [],
  loading: false,
  lastError: null,

  load: async () => {
    set({ loading: true });
    const res = await window.api.classes.list();
    if (res.ok) {
      const { years, classes } = normalize(res.data as ListShape);
      set({ years, classes });
    }
    set({ loading: false });
  },

  createClass: async (input) => {
    const res = await window.api.classes.create({ ...input, kind: 'class' });
    if (res.ok) {
      set({ lastError: null });
      await get().load();
      return true;
    }
    set({ lastError: ipcErrMessage(res) });
    return false;
  },

  updateClass: async (id, input) => {
    const res = await window.api.classes.update(id, { ...input, kind: 'class' });
    if (res.ok) {
      set({ lastError: null });
      await get().load();
      return true;
    }
    set({ lastError: ipcErrMessage(res) });
    return false;
  },

  removeClass: async (id) => {
    const res = await window.api.classes.delete(id);
    if (res.ok) {
      set({ classes: get().classes.filter((c) => c.id !== id), lastError: null });
      return true;
    }
    set({ lastError: ipcErrMessage(res) });
    return false;
  },

  createYear: async (name, orderIndex) => {
    const res = await window.api.classes.create({
      kind: 'year',
      name,
      orderIndex: orderIndex ?? get().years.length,
    });
    if (res.ok) {
      set({ lastError: null });
      await get().load();
      return true;
    }
    set({ lastError: ipcErrMessage(res) });
    return false;
  },

  updateYear: async (id, name) => {
    const res = await window.api.classes.update(id, { kind: 'year', name });
    if (res.ok) {
      set({ lastError: null });
      await get().load();
      return true;
    }
    set({ lastError: ipcErrMessage(res) });
    return false;
  },

  removeYear: async (id) => {
    const res = await window.api.classes.delete(id);
    if (res.ok) {
      set({ years: get().years.filter((y) => y.id !== id), lastError: null });
      return true;
    }
    set({ lastError: ipcErrMessage(res) });
    return false;
  },
}));
