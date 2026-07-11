import { create } from 'zustand';
import type { Constraint, ConstraintInput } from '../lib/types';

type State = {
  constraints: Constraint[];
  loading: boolean;
  load: () => Promise<void>;
  addConstraint: (input: ConstraintInput) => Promise<boolean>;
  toggleConstraint: (id: number, active: boolean) => Promise<boolean>;
  deleteConstraint: (id: number) => Promise<boolean>;
  setWeight: (id: number, weight: number) => Promise<boolean>;
};

export const useConstraintsStore = create<State>((set, get) => ({
  constraints: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.constraints.list();
    if (res.ok) set({ constraints: res.data as Constraint[] });
    set({ loading: false });
  },

  addConstraint: async (input) => {
    const res = await window.api.constraints.add(input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  toggleConstraint: async (id, active) => {
    const res = await window.api.constraints.toggle(id, active);
    if (res.ok) {
      set({
        constraints: get().constraints.map((c) =>
          c.id === id ? { ...c, active } : c,
        ),
      });
    }
    return res.ok;
  },

  deleteConstraint: async (id) => {
    const res = await window.api.constraints.delete(id);
    if (res.ok) {
      set({ constraints: get().constraints.filter((c) => c.id !== id) });
    }
    return res.ok;
  },

  setWeight: async (id, weight) => {
    const w = Math.max(0, Math.min(100, Math.floor(weight)));
    const res = await window.api.constraints.setWeight(id, w);
    if (res.ok) {
      set({
        constraints: get().constraints.map((c) =>
          c.id === id ? { ...c, weight: w } : c,
        ),
      });
    }
    return res.ok;
  },
}));
