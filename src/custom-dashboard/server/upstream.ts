/**
 * Client for the deployed custom-reports API. Port of backend/upstream.py.
 *
 * This is the ONLY external data dependency of the dashboard. Everything else
 * (chart generation, naming, suggestions) runs here against OpenAI.
 * Auth goes through the LightMetrics gateway with X-Access-Token.
 */

import { settings } from "./config";
import { ApiError, upstreamErrorFromResponse, upstreamTimeout } from "./errors";
import type { Obj } from "./util";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-Access-Token": settings.lmAccessToken,
    "X-User-Timezone": settings.lmUserTimezone,
  };
  if (settings.lmReferer) h.Referer = settings.lmReferer;
  return h;
}

async function post(url: string, body: unknown, timeoutSeconds: number): Promise<Obj> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TimeoutError" || name === "AbortError") throw upstreamTimeout(timeoutSeconds);
    throw new ApiError("upstream_unreachable", `Could not reach upstream: ${(err as Error).message}`, 502);
  }

  const text = await resp.text();
  if (!resp.ok) throw upstreamErrorFromResponse(resp.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("upstream_bad_json", `Upstream returned non-JSON: ${text.slice(0, 300)}`, 502);
  }
}

/**
 * POST /talk-to-data. `dateRange` is REQUIRED by the server. clientId/fleetId
 * come from env, never from the browser, so a tampered client cannot switch
 * tenants.
 */
export async function talkToData(opts: {
  question: string;
  dateRange: string;
  sessionId?: string | null;
  tagIds?: string[];
  generateInsights?: boolean;
}): Promise<Obj> {
  const params = new URLSearchParams({
    fleetId: settings.fleetId,
    generateInsights: opts.generateInsights ? "true" : "false",
  });
  const payload: Obj = {
    question: opts.question,
    clientId: settings.clientId,
    fleetId: settings.fleetId,
    dateRange: opts.dateRange,
    tagIds: opts.tagIds ?? [],
  };
  if (opts.sessionId) payload.sessionId = opts.sessionId;

  console.info(
    `[upstream] talk-to-data q=${JSON.stringify(opts.question.slice(0, 80))} dateRange=${opts.dateRange} session=${opts.sessionId || "<new>"}`,
  );
  return post(
    `${settings.lmApiBase}/talk-to-data?${params}`,
    payload,
    settings.upstreamConnectTimeout + settings.upstreamReadTimeout,
  );
}

/** POST /feedback. Keys off requestId, not sessionId. */
export function submitFeedback(requestId: string, rating: string, reasons: string[], comment: string) {
  return post(
    `${settings.lmApiBase}/feedback`,
    { requestId, rating, reasons: reasons ?? [], comment: comment ?? "" },
    settings.upstreamConnectTimeout + 30,
  );
}
