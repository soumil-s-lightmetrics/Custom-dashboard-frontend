import * as dashboards from "@/custom-dashboard/server/dashboards";
import { query, route } from "@/custom-dashboard/server/http";
import { getPersona } from "@/custom-dashboard/server/personas";
import * as suggestedReports from "@/custom-dashboard/server/suggestedReports";

export const dynamic = "force-dynamic";

/**
 * The three curated reports for a persona: ?persona=<id>, or the persona of
 * ?dashboardId=<id>. With neither, the generalist's.
 */
export const GET = route(async (req) => {
  const q = query(req);
  let personaId = q.get("persona");
  const dashboardId = q.get("dashboardId");
  if (!personaId && dashboardId) personaId = (await dashboards.get(dashboardId)).persona;
  const persona = getPersona(personaId);
  const reports = await suggestedReports.forPersona(persona.id);
  return { personaId: persona.id, reports, total: reports.length };
});
