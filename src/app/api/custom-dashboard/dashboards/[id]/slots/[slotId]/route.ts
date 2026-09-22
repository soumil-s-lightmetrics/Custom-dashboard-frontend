import * as chatLog from "@/custom-dashboard/server/chatLog";
import * as dashboards from "@/custom-dashboard/server/dashboards";
import { ApiError, notFound } from "@/custom-dashboard/server/errors";
import { body, query, route, type Params } from "@/custom-dashboard/server/http";
import * as resultCache from "@/custom-dashboard/server/resultCache";
import * as savedReports from "@/custom-dashboard/server/savedReports";

export const dynamic = "force-dynamic";

type Ctx = Params<{ id: string; slotId: string }>;

/** Commit a generated widget, or clone a saved report into the slot. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const { id, slotId } = await params;
  const b = await body(req);

  if (b.savedReportId) {
    const report = await savedReports.get(b.savedReportId);
    if (!report) throw notFound("saved report");
    const payload = savedReports.toSlotPayload(report);
    // A cloned widget starts a FRESH conversation — reusing the report's
    // sessionId would thread follow-ups onto the original's conversation.
    await chatLog.clear(slotId);
    const slot = await dashboards.fillSlot(id, slotId, payload);
    return { slot, staleSince: payload.snapshot?.capturedAt ?? null };
  }

  const entry = await resultCache.get(b.resultId);
  if (!entry) throw new ApiError("bad_request", "resultId is unknown or expired");

  // askedAt is stamped server-side: it is the anchor every later re-timing of
  // this question measures elapsed time against.
  const query = { ...(b.query ?? { question: entry.question }) };
  query.askedAt ??= dashboards.now();

  const slot = await dashboards.fillSlot(id, slotId, {
    state: "filled",
    title: b.title ?? null,
    source: { kind: "ai", savedReportId: null, templateId: null },
    query,
    result: b.result ?? {},
    chart: b.chart ?? {},
    snapshot: dashboards.makeSnapshot(entry.data),
    render: b.render ?? "chart",
  });
  return { slot };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id, slotId } = await params;
  return { slot: await dashboards.patchSlot(id, slotId, await body(req)) };
});

/** ?mode=clear (default) empties the slot; ?mode=remove deletes it from the grid. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id, slotId } = await params;
  const mode = query(req).get("mode") ?? "clear";
  // Always drop the thread, or a new widget here inherits the old context.
  await chatLog.clear(slotId);
  const dashboard = await dashboards.clearSlot(id, slotId, mode === "remove");
  return { ok: true, mode, dashboard };
});
