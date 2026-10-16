import { create } from "zustand";
import { api } from "../api";

/**
 * One source of truth for which widget the chat is building into.
 * ChatPanel and DashboardGrid are siblings that both subscribe — nothing is
 * passed between them by props.
 */
export const useDashboardStore = create((set, get) => ({
  dashboard: null,
  slots: [],
  layouts: { lg: [], md: [], sm: [] },
  name: "My dashboard",

  targetSlotId: null,
  targetMode: null, // 'ai' | 'saved' | 'template'
  railFocus: null, // which rail section the "+" menu sent you to
  chatOpen: true,
  railOpen: true,

  pending: {}, // { [slotId]: 'asking' | 'visualizing' | 'refreshing' }
  errors: {},

  savedReports: [],
  // The rail shows per-persona suggested reports; the old global
  // templates_catalog is still served at /api/templates but nothing renders it,
  // so it is deliberately not fetched.
  suggestedReports: [],

  hydrate: (dashboard) =>
    set({
      dashboard,
      slots: dashboard.slots || [],
      layouts: dashboard.layout || { lg: [], md: [], sm: [] },
      name: dashboard.name || "My dashboard",
    }),

  /**
   * Load the three things the builder needs, INDEPENDENTLY.
   *
   * These were one Promise.all, which made them all-or-nothing: a single
   * failing endpoint rejected the whole load, so the dashboard rendered with
   * no widgets and both rail sections read as empty. A stale server missing a
   * newly added route is enough to trigger it. Each fetch now stands alone —
   * whatever succeeds is shown, and the dashboard itself is the only one
   * whose failure is worth propagating.
   */
  loadAll: async () => {
    const [dash, saved, suggested] = await Promise.allSettled([
      api.dashboard(),
      api.savedReports(),
      api.suggestedReports(),
    ]);

    if (dash.status === "fulfilled") {
      get().hydrate(dash.value.dashboard);
    }
    set({
      savedReports:
        saved.status === "fulfilled" ? saved.value.reports || [] : [],
      suggestedReports:
        suggested.status === "fulfilled" ? suggested.value.reports || [] : [],
    });

    const failed = [
      dash.status === "rejected" && "dashboard",
      saved.status === "rejected" && "saved reports",
      suggested.status === "rejected" && "suggested reports",
    ].filter(Boolean);
    if (failed.length) {
      console.warn("loadAll: could not load", failed.join(", "));
    }
    if (dash.status === "rejected") throw dash.reason;
  },

  /**
   * The endpoint reads the persona off the dashboard document, so this must
   * run AFTER a persona change has been committed server-side.
   */
  refreshSuggestedReports: async () => {
    const { reports } = await api.suggestedReports();
    set({ suggestedReports: reports || [] });
  },

  refreshSavedReports: async () => {
    const { reports } = await api.savedReports();
    set({ savedReports: reports || [] });
  },

  /**
   * Delete a saved report outright — its stored query, snapshot and echarts
   * config all go with it. Widgets already built from it are untouched: they
   * hold their own copies, so removing the report never blanks a dashboard.
   */
  deleteSavedReport: async (reportId) => {
    await api.deleteReport(reportId);
    set((s) => ({ savedReports: s.savedReports.filter((r) => r.id !== reportId) }));
  },

  setTarget: (slotId, mode = null) => set({ targetSlotId: slotId, targetMode: mode }),
  clearTarget: () => set({ targetSlotId: null, targetMode: null, railFocus: null }),
  setRailFocus: (railFocus) => set({ railFocus }),

  /** Explicit target -> first empty slot -> add one. The chat is never a dead end. */
  ensureTarget: async () => {
    const { targetSlotId, slots } = get();
    if (targetSlotId) return targetSlotId;
    const empty = slots.find((s) => s.state === "empty");
    if (empty) {
      set({ targetSlotId: empty.i, targetMode: "ai" });
      return empty.i;
    }
    return get().addSlot();
  },

  setPending: (slotId, phase) =>
    set((s) => {
      const pending = { ...s.pending };
      if (phase) pending[slotId] = phase;
      else delete pending[slotId];
      return { pending };
    }),

  setError: (slotId, message) =>
    set((s) => {
      const errors = { ...s.errors };
      if (message) errors[slotId] = message;
      else delete errors[slotId];
      return { errors };
    }),

  replaceSlot: (slot) =>
    set((s) => ({ slots: s.slots.map((x) => (x.i === slot.i ? slot : x)) })),

  setChatOpen: (chatOpen) => set({ chatOpen }),
  setRailOpen: (railOpen) => set({ railOpen }),

  /**
   * Adds a slot, targets it, and scrolls it into view. Without the scroll the
   * new slot lands below the fold and the button looks like it did nothing.
   */
  addSlot: async () => {
    const { slotId, dashboard } = await api.addSlot();
    get().hydrate(dashboard);
    set({ targetSlotId: slotId, targetMode: "ai", railFocus: null });
    setTimeout(() => {
      document
        .querySelector(`[data-slot="${slotId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return slotId;
  },

  removeSlot: async (slotId, mode = "clear") => {
    const { dashboard } = await api.deleteSlot(slotId, mode);
    get().hydrate(dashboard);
    if (get().targetSlotId === slotId) get().clearTarget();
  },

  setLayouts: (layouts) => set({ layouts }),

  setName: async (name) => {
    set({ name });
    await api.patchDashboard({ name, nameSource: "manual" });
  },
}));
