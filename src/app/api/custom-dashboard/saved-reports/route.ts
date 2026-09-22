import * as chatLog from "@/custom-dashboard/server/chatLog";
import * as dashboards from "@/custom-dashboard/server/dashboards";
import { ApiError } from "@/custom-dashboard/server/errors";
import { body, query, route } from "@/custom-dashboard/server/http";
import * as savedReports from "@/custom-dashboard/server/savedReports";

export const dynamic = "force-dynamic";

/** ?include=full keeps the snapshot rows; otherwise only their metadata. */
export const GET = route(async (req) => {
  const reports = await savedReports.listAll(query(req).get("include") === "full");
  return { reports, total: reports.length };
});

/** Body {slotId, dashboardId?, title?, description?}. */
export const POST = route(async (req) => {
  const b = await body(req);
  if (!b.slotId) throw new ApiError("bad_request", "'slotId' is required");

  const hit = await dashboards.findSlot(b.slotId, b.dashboardId);
  if (!hit || hit.slot.state !== "filled") throw new ApiError("bad_request", "That slot has no widget to save");

  const report = await savedReports.create(hit.slot, {
    title: b.title,
    description: b.description ?? "",
    persona: hit.dashboard.persona ?? null,
    sessionId: await chatLog.getSessionId(b.slotId),
  });
  return Response.json({ report }, { status: 201 });
});
