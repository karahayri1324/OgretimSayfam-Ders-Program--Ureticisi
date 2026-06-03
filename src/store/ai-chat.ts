import { create } from 'zustand';
import type { AIResponse } from '../lib/types';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AIResponse;
  status?: 'pending' | 'confirmed' | 'rejected';
  notice?: 'subscription' | 'rateLimit' | 'authError';
};

export type PendingPromptMode = 'fill' | 'send';

type State = {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clear: () => void;

  pendingPrompt: { text: string; mode: PendingPromptMode } | null;
  setPendingPrompt: (text: string, mode?: PendingPromptMode) => void;
  consumePendingPrompt: () => { text: string; mode: PendingPromptMode } | null;
  panelOpenSignal: number;
  requestOpenPanel: () => void;

  pendingExport: { format: string; class?: string | null } | null;
  setPendingExport: (req: { format: string; class?: string | null }) => void;
  consumePendingExport: () => { format: string; class?: string | null } | null;
};

export const useAIChatStore = create<State>((set, get) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  clear: () => set({ messages: [] }),

  pendingPrompt: null,
  setPendingPrompt: (text, mode = 'fill') =>
    set({ pendingPrompt: { text, mode } }),
  consumePendingPrompt: () => {
    const cur = get().pendingPrompt;
    if (cur) set({ pendingPrompt: null });
    return cur;
  },

  panelOpenSignal: 0,
  requestOpenPanel: () => set({ panelOpenSignal: get().panelOpenSignal + 1 }),

  pendingExport: null,
  setPendingExport: (req) => set({ pendingExport: req }),
  consumePendingExport: () => {
    const cur = get().pendingExport;
    if (cur) set({ pendingExport: null });
    return cur;
  },
}));

export type PendingExport = { format: string; class?: string | null };
