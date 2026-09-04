import { del, get, patch, post, put } from "./client";

export const api = {
  config: () => get("/config"),

  personas: () => get("/personas"),
  suggestions: (id, n = 3, refresh = false) =>
    get(`/personas/${id}/suggestions?n=${n}&refresh=${refresh}`),
  selectPersona: (personaId) => post("/personas/select", { personaId }),
  templates: () => get("/templates"),
  // Persona comes from the dashboard document server-side, so no argument.
  suggestedReports: () => get("/suggested-reports"),

  ask: (body) => post("/chat/ask", body),
  visualize: (body) => post("/chat/visualize", body),
  name: (body) => post("/chat/name", body),
  history: (slotId) => get(`/chat/history?slotId=${encodeURIComponent(slotId)}`),
  feedback: (body) => post("/chat/feedback", body),

  dashboard: () => get("/dashboards/default"),
  patchDashboard: (body) => patch("/dashboards/default", body),
  suggestDashboardName: () => post("/dashboards/default/suggest-name", {}),
  setLayout: (layout) => put("/dashboards/default/layout", { layout }),
  addSlot: () => post("/dashboards/default/slots", {}),
  fillSlot: (slotId, body) => put(`/dashboards/default/slots/${slotId}`, body),
  patchSlot: (slotId, body) => patch(`/dashboards/default/slots/${slotId}`, body),
  deleteSlot: (slotId, mode = "clear") =>
    del(`/dashboards/default/slots/${slotId}?mode=${mode}`),
  refreshSlot: (slotId) => post(`/dashboards/default/slots/${slotId}/refresh`, {}),

  savedReports: () => get("/saved-reports"),
  saveReport: (body) => post("/saved-reports", body),
  deleteReport: (id) => del(`/saved-reports/${id}`),
};
