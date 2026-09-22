import { promptChartType } from "@/custom-dashboard/server/chartTypes";
import * as dashboards from "@/custom-dashboard/server/dashboards";
import * as daterange from "@/custom-dashboard/server/daterange";
import { ApiError, notFound } from "@/custom-dashboard/server/errors";
import { route, type Params } from "@/custom-dashboard/server/http";
import { normalizeAsk } from "@/custom-dashboard/server/normalize";
import { retimeQuery } from "@/custom-dashboard/server/queryRefresh";
import * as upstream from "@/custom-dashboard/server/upstream";
import type { Obj } from "@/custom-dashboard/server/util";
import { generate } from "@/custom-dashboard/server/visualize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Re-ask the stored question and re-chart at the stored type. Backs
 * insert-reuse, the refresh button and the stale badge.
 *
 * The stored dateRange is relative, so re-running today means today's window;
 * absolute dates inside the question are re-anchored to today first.
 */
export const POST = route<Params<{ id: string; slotId: string }>>(async (_req, { params }) => {
  const { id, slotId } = await params;
  const slot = await dashboards.getSlot(id, slotId);
  if (!slot) throw notFound("slot");

  if (!slot.query?.question) {
    throw new ApiError("bad_request", "This widget has no stored question to re-run");
  }

  const [query, retimed] = retimeQuery(slot.query as Obj);
  const question: string = query.question;

  let dateRange: string | null = query.dateRange ?? null;
  let source: string = query.dateRangeSource ?? "manual";
  if (!dateRange) {
    [dateRange, source] = await daterange.resolve(question);
    if (!dateRange) throw new ApiError("bad_request", "This widget has no stored date range");
  }

  const payload = await upstream.talkToData({
    question,
    dateRange,
    sessionId: null,
    tagIds: query.tagIds ?? [],
  });
  const fresh = normalizeAsk(payload, dateRange, source);

  if (!fresh.hasData) {
    // Keep the existing snapshot rather than blanking the widget.
    throw new ApiError("refresh_empty", fresh.answer || "The refreshed query returned no rows.", 409);
  }

  const chartId: string = slot.chart?.chartType || "auto";
  let render: string = slot.render ?? "chart";
  let chart: Obj = slot.chart ?? {};
  if (render !== "table") {
    const viz = await generate(fresh.data, promptChartType(chartId), question);
    if (viz.kind === "too_broad") {
      render = "table";
    } else {
      chart = {
        chartType: chartId,
        echartsOption: viz.echartsOption,
        reasoning: viz.reasoning ?? "",
        aggregation: viz.aggregation ?? null,
      };
    }
  }

  const updated = await dashboards.fillSlot(id, slotId, {
    state: "filled",
    title: slot.title ?? null,
    source: slot.source ?? null,
    query: { ...query, dateRange, dateRangeSource: source },
    result: {
      domain: fresh.domain ?? null,
      reportSourceId: fresh.reportSourceId ?? null,
      answer: fresh.answer ?? null,
      upstreamRequestId: fresh.requestId ?? null,
    },
    chart,
    snapshot: dashboards.makeSnapshot(fresh.data),
    render,
  });

  return {
    slot: updated,
    refreshedAt: updated.snapshot.capturedAt,
    // Present only when dates in the question moved, so the UI can say so.
    retimed,
  };
});
