import { promptChartType } from "@/custom-dashboard/server/chartTypes";
import * as dashboards from "@/custom-dashboard/server/dashboards";
import { ApiError } from "@/custom-dashboard/server/errors";
import { body, route } from "@/custom-dashboard/server/http";
import * as resultCache from "@/custom-dashboard/server/resultCache";
import { generate } from "@/custom-dashboard/server/visualize";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Chart generation via OpenAI. No upstream data call. Data comes from, in
 * order: the result cache, the slot's stored snapshot, or inline `data`.
 */
export const POST = route(async (req) => {
  const b = await body(req);

  const chartId = String(b.chartType || "auto").trim();
  if (chartId === "table") throw new ApiError("bad_request", "Table mode needs no chart generation");

  let data: unknown = null;
  let question: string | null = b.question ?? null;

  const entry = await resultCache.get(b.resultId);
  if (entry) {
    data = entry.data;
    question ||= entry.question;
  }

  if (data === null && b.slotId) {
    const hit = await dashboards.findSlot(b.slotId, b.dashboardId);
    if (hit?.slot.snapshot?.data) {
      data = hit.slot.snapshot.data;
      question ||= hit.slot.query?.question ?? null;
    }
  }

  if (data === null) data = b.data ?? null;
  if (data === null) throw new ApiError("bad_request", "No data to visualize — pass resultId, slotId, or data");

  const result = await generate(data, promptChartType(chartId), question);
  result.render ??= "chart";
  result.chartType = chartId;
  return result;
});
