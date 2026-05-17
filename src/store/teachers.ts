import { create } from 'zustand';
import type { Teacher, TeacherInput } from '../lib/types';

type State = {
  teachers: Teacher[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: TeacherInput) => Promise<boolean>;
  update: (id: number, input: TeacherInput) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
};

export const useTeachersStore = create<State>((set, get) => ({
  teachers: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.teachers.list();
    if (res.ok) set({ teachers: res.data as Teacher[] });
    set({ loading: false });
  },

  create: async (input) => {
    const res = await window.api.teachers.create(input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  update: async (id, input) => {
    const res = await window.api.teachers.update(id, input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  remove: async (id) => {
    const res = await window.api.teachers.delete(id);
    if (res.ok) {
      set({ teachers: get().teachers.filter((t) => t.id !== id) });
      return true;
    }
    return false;
  },
}));
