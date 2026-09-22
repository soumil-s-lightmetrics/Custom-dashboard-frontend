import { ApiError } from "@/custom-dashboard/server/errors";
import { body, route } from "@/custom-dashboard/server/http";
import { submitFeedback } from "@/custom-dashboard/server/upstream";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const b = await body(req);
  if (!b.requestId) throw new ApiError("bad_request", "'requestId' must be a non-empty string");
  if (b.rating !== "positive" && b.rating !== "negative") {
    throw new ApiError("bad_request", "'rating' must be 'positive' or 'negative'");
  }
  return submitFeedback(b.requestId, b.rating, b.reasons ?? [], b.comment ?? "");
});
