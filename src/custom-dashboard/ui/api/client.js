// Same-origin Next.js route handlers (src/app/api/custom-dashboard).
const BASE = "/api/custom-dashboard";

export class ApiError extends Error {
  constructor(code, message, status, upstreamStatus) {
    super(message);
    this.code = code;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("bad_json", text.slice(0, 200), res.status);
  }

  if (!res.ok) {
    const e = json.error || {};
    throw new ApiError(
      e.code || "error",
      e.message || res.statusText,
      res.status,
      e.upstreamStatus,
    );
  }
  return json;
}

export const get = (p) => request(p);
export const post = (p, body) => request(p, { method: "POST", body });
export const put = (p, body) => request(p, { method: "PUT", body });
export const patch = (p, body) => request(p, { method: "PATCH", body });
export const del = (p) => request(p, { method: "DELETE" });
