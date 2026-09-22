import { del, get, patch, post, put } from "./client";

const q = encodeURIComponent;
const dash = (id) => `/dashboards/${q(id)}`;

export const api = {
  config: () => get("/config"),

  personas: () => get("/personas"),
  suggestions: (id, n = 3, refresh = false) =>
    get(`/personas/${q(id)}/suggestions?n=${n}&refresh=${refresh}`),
  selectPersona: (personaId) => post("/personas/select", { personaId }),
  // Persona comes from the dashboard document server-side.
  suggestedReports: (dashboardId) => get(`/suggested-reports?dashboardId=${q(dashboardId)}`),

  ask: (body) => post("/chat/ask", body),
  visualize: (body) => post("/chat/visualize", body),
  name: (body) => post("/chat/name", body),
  history: (slotId) => get(`/chat/history?slotId=${q(slotId)}`),
  feedback: (body) => post("/chat/feedback", body),

  // Picker
  listDashboards: (persona) => get(`/dashboards${persona ? `?persona=${q(persona)}` : ""}`),
  createDashboard: (body) => post("/dashboards", body),
  deleteDashboard: (id) => del(dash(id)),

  // One dashboard
  dashboard: (id) => get(dash(id)),
  patchDashboard: (id, body) => patch(dash(id), body),
  suggestDashboardName: (id) => post(`${dash(id)}/suggest-name`, {}),
  setLayout: (id, layout) => put(`${dash(id)}/layout`, { layout }),
  addSlot: (id) => post(`${dash(id)}/slots`, {}),
  fillSlot: (id, slotId, body) => put(`${dash(id)}/slots/${q(slotId)}`, body),
  patchSlot: (id, slotId, body) => patch(`${dash(id)}/slots/${q(slotId)}`, body),
  deleteSlot: (id, slotId, mode = "clear") => del(`${dash(id)}/slots/${q(slotId)}?mode=${mode}`),
  refreshSlot: (id, slotId) => post(`${dash(id)}/slots/${q(slotId)}/refresh`, {}),

  savedReports: () => get("/saved-reports"),
  saveReport: (body) => post("/saved-reports", body),
  deleteReport: (id) => del(`/saved-reports/${q(id)}`),
};
