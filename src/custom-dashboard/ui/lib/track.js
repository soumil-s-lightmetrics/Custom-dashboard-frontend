// Fire-and-forget flow events -> /api/custom-dashboard/log -> server stdout
// (CloudWatch on Amplify). Never throws and never blocks the UI.

const URL_ = "/api/custom-dashboard/log";

let sessionId;
/** Per-tab id, also sent as X-Session-Id on API calls to join both logs. */
export function session() {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem("cd.sid");
    if (!sessionId) {
      sessionId = Math.random().toString(16).slice(2, 10);
      sessionStorage.setItem("cd.sid", sessionId);
    }
  } catch {
    sessionId ??= Math.random().toString(16).slice(2, 10);
  }
  return sessionId;
}

export function track(event, data, level = "info") {
  try {
    const payload = JSON.stringify({
      event,
      level,
      data,
      sessionId: session(),
      path: window.location.pathname,
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (!navigator.sendBeacon?.(URL_, blob)) {
      fetch(URL_, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* logging must never break the app */
  }
}

export const trackError = (event, err, data) =>
  track(event, { ...data, message: err?.message, code: err?.code, status: err?.status }, "error");
