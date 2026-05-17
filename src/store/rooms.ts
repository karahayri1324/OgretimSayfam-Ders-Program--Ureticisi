import { create } from 'zustand';
import type { Room, RoomInput } from '../lib/types';

type State = {
  rooms: Room[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: RoomInput) => Promise<boolean>;
  update: (id: number, input: RoomInput) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
};

export const useRoomsStore = create<State>((set, get) => ({
  rooms: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const res = await window.api.rooms.list();
    if (res.ok) set({ rooms: res.data as Room[] });
    set({ loading: false });
  },

  create: async (input) => {
    const res = await window.api.rooms.create(input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  update: async (id, input) => {
    const res = await window.api.rooms.update(id, input);
    if (res.ok) {
      await get().load();
      return true;
    }
    return false;
  },

  remove: async (id) => {
    const res = await window.api.rooms.delete(id);
    if (res.ok) {
      set({ rooms: get().rooms.filter((r) => r.id !== id) });
      return true;
    }
    return false;
  },
}));
