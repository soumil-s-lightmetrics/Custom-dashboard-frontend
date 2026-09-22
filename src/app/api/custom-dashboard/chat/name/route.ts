import * as dashboards from "@/custom-dashboard/server/dashboards";
import { body, route } from "@/custom-dashboard/server/http";
import { widgetName } from "@/custom-dashboard/server/naming";
import { firstRows } from "@/custom-dashboard/server/normalize";
import * as resultCache from "@/custom-dashboard/server/resultCache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Name a widget from the question plus the returned rows. */
export const POST = route(async (req) => {
  const b = await body(req);
  let question = String(b.question ?? "").trim();
  let data: unknown = null;

  const entry = await resultCache.get(b.resultId);
  if (entry) {
    data = entry.data;
    question ||= entry.question ?? "";
  }

  if (data === null && b.slotId) {
    const hit = await dashboards.findSlot(b.slotId, b.dashboardId);
    if (hit) {
      data = hit.slot.snapshot?.data ?? null;
      question ||= hit.slot.query?.question ?? "";
    }
  }

  if (data === null) data = b.data ?? null;
  return widgetName(question, firstRows(data));
});
