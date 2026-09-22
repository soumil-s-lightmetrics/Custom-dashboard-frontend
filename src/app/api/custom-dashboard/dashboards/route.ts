import * as dashboards from "@/custom-dashboard/server/dashboards";
import { body, query, route } from "@/custom-dashboard/server/http";

export const dynamic = "force-dynamic";

/**
 * Picker listing: dashboards whose persona matches ?persona=, newest first.
 * No persona (the Skip path) or "generalist" lists every dashboard.
 */
export const GET = route(async (req) => {
  const persona = query(req).get("persona");
  const list = await dashboards.list(persona);
  return { dashboards: list, total: list.length };
});

/** Body {name?, persona}. A blank name becomes "<Persona> Dashboard". */
export const POST = route(async (req) => {
  const b = await body(req);
  const dashboard = await dashboards.create({ name: b.name, persona: b.persona });
  return Response.json({ dashboard }, { status: 201 });
});
