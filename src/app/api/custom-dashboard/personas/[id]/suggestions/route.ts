import { query, route, type Params } from "@/custom-dashboard/server/http";
import { getSuggestions } from "@/custom-dashboard/server/suggestions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route<Params<{ id: string }>>(async (req, { params }) => {
  const { id } = await params;
  const q = query(req);
  const n = Math.min(Math.max(Number.parseInt(q.get("n") ?? "3", 10) || 3, 1), 6);
  const refresh = (q.get("refresh") ?? "false").toLowerCase() === "true";
  return getSuggestions(id, n, refresh);
});
