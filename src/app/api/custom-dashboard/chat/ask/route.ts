import * as chatLog from "@/custom-dashboard/server/chatLog";
import { DATE_RANGES, isDateRange } from "@/custom-dashboard/server/config";
import * as daterange from "@/custom-dashboard/server/daterange";
import { ApiError } from "@/custom-dashboard/server/errors";
import { body, route } from "@/custom-dashboard/server/http";
import { normalizeAsk } from "@/custom-dashboard/server/normalize";
import * as resultCache from "@/custom-dashboard/server/resultCache";
import * as upstream from "@/custom-dashboard/server/upstream";

export const dynamic = "force-dynamic";
// talk-to-data can take minutes on a broad question.
export const maxDuration = 300;

/** The ONLY route that asks the deployed custom-reports API for data. */
export const POST = route(async (req) => {
  const b = await body(req);

  const question = String(b.question ?? "").trim();
  if (!question) throw new ApiError("bad_request", "'question' must be a non-empty string");

  const slotId: string | null = b.slotId ?? null;
  const tagIds = b.tagIds ?? [];
  if (!Array.isArray(tagIds)) throw new ApiError("bad_request", "'tagIds' must be a list");

  // --- date range: regex -> LLM -> ask the user. Never a silent default. ---
  let dateRange: string;
  let source: string;
  const supplied = String(b.dateRange ?? "").trim();
  if (supplied) {
    if (!isDateRange(supplied)) {
      throw new ApiError("bad_request", `'dateRange' must be one of: ${DATE_RANGES.join(", ")}`);
    }
    [dateRange, source] = [supplied, "manual"];
  } else {
    const [resolved, how] = await daterange.resolve(question);
    if (!resolved) {
      // Stop here — no upstream call at all.
      await chatLog.append(slotId, [
        { role: "user", text: question, kind: "answer" },
        { role: "bot", text: "Which time range should I use?", kind: "needs_daterange" },
      ]);
      return {
        kind: "needs_daterange",
        hasData: false,
        question,
        options: DATE_RANGES,
        message: "I couldn't tell what time range you meant. Pick one and I'll run it.",
      };
    }
    [dateRange, source] = [resolved, how];
  }

  // --- session: owned by the thread, so widgets don't share conversations ---
  const sessionId = b.sessionId || (await chatLog.getSessionId(slotId));

  const payload = await upstream.talkToData({ question, dateRange, sessionId, tagIds, generateInsights: false });
  const result = normalizeAsk(payload, dateRange, source);

  if (result.sessionId) await chatLog.setSessionId(slotId, result.sessionId);
  if (result.hasData) result.resultId = await resultCache.put(result.data, question, result.sessionId ?? "");

  await chatLog.append(slotId, [
    { role: "user", text: question, kind: "answer", dateRange, dateRangeSource: source },
    {
      role: "bot",
      text: result.answer ?? "",
      kind: result.kind,
      requestId: result.requestId,
      resultId: result.resultId ?? null,
      dateRange,
      dateRangeSource: source,
    },
  ]);

  return result;
});
