/** Route-handler plumbing shared by every src/app/api route. */

import { ApiError } from "./errors";
import { isObj, type Obj } from "./util";

type Handler<C> = (req: Request, ctx: C) => Promise<unknown>;

/**
 * Wrap a handler: plain return values become JSON, ApiErrors become the
 * uniform {"error": {...}} envelope, anything else a 500 in the same shape.
 */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out);
    } catch (err) {
      if (err instanceof ApiError) return Response.json(err.toJSON(), { status: err.status });
      console.error("[api] unhandled error", err);
      return Response.json(
        { error: { code: "internal_error", message: (err as Error).message, upstreamStatus: null } },
        { status: 500 },
      );
    }
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
