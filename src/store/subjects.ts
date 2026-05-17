import { create } from 'zustand';
import type { Subject, SubjectInput } from '../lib/types';

type State = {
  subjects: Subject[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: SubjectInput) => Promise<boolean>;
  update: (id: number, input: SubjectInput) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
};

export const useSubjectsStore = create<State>((set, get) => ({
  subjects: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.subjects.list();
    if (res.ok) set({ subjects: res.data as Subject[] });
    set({ loading: false });
  },

  create: async (input) => {
    const res = await window.api.subjects.create(input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  update: async (id, input) => {
    const res = await window.api.subjects.update(id, input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  remove: async (id) => {
    const res = await window.api.subjects.delete(id);
    if (res.ok) {
      set({ subjects: get().subjects.filter((s) => s.id !== id) });
      return true;
    }
    return false;
  },
}));
