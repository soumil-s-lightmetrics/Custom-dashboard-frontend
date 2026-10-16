import { create } from "zustand";

let seq = 0;
const nextId = () => `m_${Date.now()}_${seq++}`;

export const useChatStore = create((set, get) => ({
  messages: [],
  suggestions: [],
  suggestionsSource: null,
  sending: false,
  // Set when a question can't be date-resolved; holds the question to resend.
  pendingDateQuestion: null,
  contextExpired: false,

  push: (msg) =>
    set((s) => ({ messages: [...s.messages, { id: nextId(), ...msg }] })),

  replaceLast: (patch) =>
    set((s) => {
      if (!s.messages.length) return s;
      const messages = s.messages.slice();
      messages[messages.length - 1] = { ...messages[messages.length - 1], ...patch };
      return { messages };
    }),

  setSending: (sending) => set({ sending }),
  setSuggestions: (suggestions, source) =>
    set({ suggestions: suggestions || [], suggestionsSource: source }),
  setPendingDateQuestion: (q) => set({ pendingDateQuestion: q }),

  /** Restore a slot's transcript from the server. */
  loadThread: (thread) =>
    set({
      messages: (thread?.messages || []).map((m) => ({
        id: m.id || nextId(),
        role: m.role,
        text: m.text,
        kind: m.kind,
        dateRange: m.dateRange,
        dateRangeSource: m.dateRangeSource,
        requestId: m.requestId,
        historical: true,
      })),
      contextExpired: !!thread?.contextExpired,
      pendingDateQuestion: null,
    }),

  reset: () =>
    set({ messages: [], pendingDateQuestion: null, contextExpired: false }),
}));
