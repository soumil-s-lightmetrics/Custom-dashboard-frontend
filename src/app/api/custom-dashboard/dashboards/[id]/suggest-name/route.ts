import * as dashboards from "@/custom-dashboard/server/dashboards";
import { route, type Params } from "@/custom-dashboard/server/http";
import { dashboardNames } from "@/custom-dashboard/server/naming";
import { getPersona } from "@/custom-dashboard/server/personas";
import type { Obj } from "@/custom-dashboard/server/util";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route<Params<{ id: string }>>(async (_req, { params }) => {
  const { id } = await params;
  const dash = await dashboards.get(id);
  const titles = (dash.slots ?? []).map((s: Obj) => s.title).filter(Boolean);
  return { suggestions: await dashboardNames(getPersona(dash.persona).title, titles) };
});
