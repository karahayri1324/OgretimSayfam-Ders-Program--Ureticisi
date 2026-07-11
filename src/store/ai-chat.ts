import { create } from 'zustand';
import type { AIResponse, AIMessage } from '../lib/types';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AIResponse;
  status?: 'pending' | 'confirmed' | 'rejected';
  notice?: 'subscription' | 'rateLimit' | 'authError';
  historical?: boolean;
};

// Kalıcı geçmişteki assistant satırı JSON.stringify(response) olarak saklanır; UI'da göstermek
// için okunabilir metni çıkar (model bağlamına giden geçmişle UI'ı hizala — aksi halde restart
// sonrası UI boş ama model DB'deki geçmişi görüyordu, kullanıcı 'yeni sohbet' sanıyordu).
function assistantText(raw: string): string {
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    const t =
      (r.explanation as string) ??
      (r.answer as string) ??
      (r.kind === 'tool_call' ? `Tool çağrısı: ${String(r.tool)}` : '');
    return typeof t === 'string' && t.trim() ? t : raw;
  } catch {
    return raw;
  }
}

export type PendingPromptMode = 'fill' | 'send';

type State = {
  messages: ChatMessage[];
  historyLoaded: boolean;
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  loadHistory: () => Promise<void>;
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
  historyLoaded: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  loadHistory: async () => {
    if (get().historyLoaded || get().messages.length > 0) {
      set({ historyLoaded: true });
      return;
    }
    const res = await window.api.ai.history();
    if (!res.ok) return;
    const rows = res.data as AIMessage[];
    const restored: ChatMessage[] = [];
    for (const m of rows) {
      // Yalnız user/assistant konuşma satırları gösterilir; 'system' (tool_call) iç kayıtları atlanır.
      if (m.role === 'user') {
        restored.push({ id: `h${m.id}`, role: 'user', text: m.text, historical: true });
      } else if (m.role === 'assistant') {
        restored.push({
          id: `h${m.id}`,
          role: 'assistant',
          text: assistantText(m.text),
          historical: true,
        });
      }
    }
    set({ messages: restored, historyLoaded: true });
  },

  clear: () => set({ messages: [], historyLoaded: true }),

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
