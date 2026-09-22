import * as chatLog from "@/custom-dashboard/server/chatLog";
import { ApiError } from "@/custom-dashboard/server/errors";
import { query, route } from "@/custom-dashboard/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const slotId = query(req).get("slotId");
  const thread = await chatLog.getThread(slotId);
  const age = await chatLog.lastTurnAgeMinutes(slotId);
  return {
    thread: {
      sessionId: thread.sessionId ?? null,
      messages: thread.messages ?? [],
      lastTurnAgeMinutes: age,
      // Upstream drops context past 60 minutes, so the UI can mark the seam.
      contextExpired: age !== null && age > chatLog.CONTEXT_TTL_MINUTES,
    },
  };
});

export const DELETE = route(async (req) => {
  const slotId = query(req).get("slotId");
  if (!slotId) throw new ApiError("bad_request", "'slotId' is required");
  await chatLog.clear(slotId);
  return { cleared: true };
});
