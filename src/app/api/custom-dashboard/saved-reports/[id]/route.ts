import { notFound } from "@/custom-dashboard/server/errors";
import { body, route, type Params } from "@/custom-dashboard/server/http";
import * as savedReports from "@/custom-dashboard/server/savedReports";

export const dynamic = "force-dynamic";

type Ctx = Params<{ id: string }>;

export const GET = route<Ctx>(async (_req, { params }) => {
  const report = await savedReports.get((await params).id);
  if (!report) throw notFound("saved report");
  return { report };
});

/** Only title and description can change. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const report = await savedReports.patch((await params).id, await body(req));
  if (!report) throw notFound("saved report");
  return { report };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  if (!(await savedReports.remove((await params).id))) throw notFound("saved report");
  return { deleted: true };
});
