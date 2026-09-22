import { body, route } from "@/custom-dashboard/server/http";
import { log } from "@/custom-dashboard/server/log";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);

/**
 * Client flow events (screen views, persona choice, client-side failures) so
 * the whole user journey shows up next to the access log in CloudWatch.
 */
export const POST = route(async (req) => {
  const b = await body(req);
  log(b.level === "error" ? "error" : "flow", {
    source: "client",
    event: str(b.event, 64) ?? "unknown",
    sessionId: str(b.sessionId, 32),
    path: str(b.path),
    data: b.data && typeof b.data === "object" ? JSON.stringify(b.data).slice(0, 1000) : undefined,
    ua: str(req.headers.get("user-agent")),
  });
  return new Response(null, { status: 204 });
});
