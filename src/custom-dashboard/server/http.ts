/** Route-handler plumbing shared by every src/app/api route. */

import { ApiError } from "./errors";
import { log } from "./log";
import { hex, isObj, type Obj } from "./util";

type Handler<C> = (req: Request, ctx: C) => Promise<unknown>;

/**
 * Wrap a handler: plain return values become JSON, ApiErrors become the
 * uniform {"error": {...}} envelope, anything else a 500 in the same shape.
 * Every request writes one access-log line; the id is echoed as X-Request-Id.
 */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const started = Date.now();
    const requestId = req.headers.get("x-request-id") || hex(8);
    const url = new URL(req.url);
    let res: Response;
    let error: Obj | undefined;
    try {
      const out = await fn(req, ctx);
      res = out instanceof Response ? out : Response.json(out);
    } catch (err) {
      if (err instanceof ApiError) {
        error = { code: err.code, message: err.message };
        res = Response.json(err.toJSON(), { status: err.status });
      } else {
        error = { code: "internal_error", message: (err as Error).message, stack: (err as Error).stack };
        res = Response.json(
          { error: { code: "internal_error", message: (err as Error).message, upstreamStatus: null } },
          { status: 500 },
        );
      }
    }
    try {
      res.headers.set("X-Request-Id", requestId);
    } catch {
      /* immutable headers (e.g. Response.redirect) — the log line still has the id */
    }
    // The flow-event endpoint logs its own line; skip the duplicate on success.
    if (url.pathname.endsWith("/custom-dashboard/log") && res.status < 400) return res;
    log("access", {
      requestId,
      sessionId: req.headers.get("x-session-id") || undefined,
      method: req.method,
      path: url.pathname,
      query: url.search || undefined,
      status: res.status,
      ms: Date.now() - started,
      error,
    });
    return res;
  };
}

/** The request's JSON object body, or {} (Flask's get_json(silent=True) or {}). */
export async function body(req: Request): Promise<Obj> {
  try {
    const parsed = await req.json();
    return isObj(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const query = (req: Request) => new URL(req.url).searchParams;

export type Params<P> = { params: Promise<P> };
