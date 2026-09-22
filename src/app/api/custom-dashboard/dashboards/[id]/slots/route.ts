import * as dashboards from "@/custom-dashboard/server/dashboards";
import { route, type Params } from "@/custom-dashboard/server/http";

export const dynamic = "force-dynamic";

export const POST = route<Params<{ id: string }>>(async (_req, { params }) => {
  const { id } = await params;
  return dashboards.addSlot(id);
});
