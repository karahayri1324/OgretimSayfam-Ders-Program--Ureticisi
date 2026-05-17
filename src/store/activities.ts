import { create } from 'zustand';
import type { Activity, ActivityInput } from '../lib/types';

type State = {
  activities: Activity[];
  loading: boolean;
  load: () => Promise<void>;
  upsert: (input: ActivityInput & { id?: number }) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  setSplit: (activityIds: number[]) => Promise<boolean>;
  clearSplit: (id: number) => Promise<boolean>;
  findByCell: (classId: number, subjectId: number) => Activity | undefined;
};

export const useActivitiesStore = create<State>((set, get) => ({
  activities: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.activities.list();
    if (res.ok) set({ activities: res.data as Activity[] });
    set({ loading: false });
  },

  upsert: async (input) => {
    const res = await window.api.activities.upsert(input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  remove: async (id) => {
    const res = await window.api.activities.delete(id);
    if (res.ok) {
      set({ activities: get().activities.filter((a) => a.id !== id) });
      return true;
    }
    return false;
  },

  setSplit: async (activityIds) => {
    const res = await window.api.activities.setSplit(activityIds);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  clearSplit: async (id) => {
    const res = await window.api.activities.clearSplit(id);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  findByCell: (classId, subjectId) =>
    get().activities.find(
      (a) => a.classId === classId && a.subjectId === subjectId,
    ),
}));
