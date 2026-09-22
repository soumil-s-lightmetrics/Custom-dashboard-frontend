import * as chatLog from "@/custom-dashboard/server/chatLog";
import * as dashboards from "@/custom-dashboard/server/dashboards";
import { body, route, type Params } from "@/custom-dashboard/server/http";

export const dynamic = "force-dynamic";

type Ctx = Params<{ id: string }>;

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  return { dashboard: await dashboards.get(id) };
});

/** Only name, nameSource, persona and globalFilters can change. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  return { dashboard: await dashboards.patch(id, await body(req)) };
});

/** Deletes the dashboard and every chat thread behind its slots. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const slotIds = await dashboards.remove(id);
  await chatLog.clear(slotIds);
  return { deleted: true };
});
