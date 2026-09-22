import * as dashboards from "@/custom-dashboard/server/dashboards";
import { body, route, type Params } from "@/custom-dashboard/server/http";

export const dynamic = "force-dynamic";

export const PUT = route<Params<{ id: string }>>(async (req, { params }) => {
  const { id } = await params;
  const { layout } = await body(req);
  dashboards.assertLayout(layout);
  const dash = await dashboards.setLayout(id, layout);
  return { ok: true, updatedAt: dash.updatedAt };
});
