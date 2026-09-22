// Where this app is mounted inside LM labs. Every page link and router target
// is built from here, so the app can move without hunting for "/" literals.
export const ROOT = "/custom-dashboard";
export const DASHBOARDS = `${ROOT}/dashboards`;
export const dashboardPath = (id) => `${DASHBOARDS}/${id}`;
