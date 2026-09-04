  import { create } from "zustand";

  const PERSONA_KEY = "cd.persona";
  const NAME_KEY = "cd.userName";

  function readPersona() {
    try {
      const v = localStorage.getItem(PERSONA_KEY);
      // undefined = never visited the persona screen; null = explicitly skipped.
      return v === null ? undefined : JSON.parse(v);
    } catch {
      return undefined;
    }
  }

  function readName() {
    try {
      return localStorage.getItem(NAME_KEY) || null;
    } catch {
      return null;
    }
}
// zustand is a js object, useSessionStore is the hook 
export const useSessionStore = create((set) => ({
  ready: false,
  // Empty until the user types it on the persona screen — the env USER_NAME is
  // only a suggestion, not a default to impose.
  userName: readName() || "",
  clientId: "",
  fleetId: "",
  dateRanges: [],
  dateRangePickerPrefill: "Past 30 days",
  chartTypes: [],
  persona: readPersona(),

  hydrate: (config) =>
    set({
      ready: true,
      // A name the user typed always wins; otherwise leave it blank so the
      // persona screen asks rather than assuming.
      userName: readName() || "",
      clientId: config.clientId,
      fleetId: config.fleetId,
      dateRanges: config.dateRanges || [],
      dateRangePickerPrefill: config.dateRangePickerPrefill || "Past 30 days",
      chartTypes: config.chartTypes || [],
    }),

  setUserName: (userName) => {
    try {
      localStorage.setItem(NAME_KEY, userName);
    } catch {
      /* private mode — the name just won't survive a reload */
    }
    set({ userName });
  },

  setPersona: (persona) => {
    try {
      localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch {
      /* private mode — persona just won't survive a reload */
    }
    set({ persona });
  },
}));
