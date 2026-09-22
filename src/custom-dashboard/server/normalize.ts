/**
 * Normalise a talk-to-data response. Port of backend/normalize.py.
 *
 * The API answers 200 in four shapes:
 *   1. data           {answer, sessionId, requestId, metadata:{domain, reportSourceId}, data:[[rows]]}
 *   2. resolution     {answer, sessionId, needsResolution:true, candidates:[...]}
 *   3. slot-filling   {answer, sessionId}                       — no data, no requestId
 *   4. plain string   {answer, sessionId, requestId}            — chit-chat / refusal
 */

import { isObj, type Obj } from "./util";

/** Python truthiness: empty lists, objects and strings are false. */
function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

function rowCounts(data: unknown): number[] {
  if (!Array.isArray(data)) return [];
  return data.map((block) => (Array.isArray(block) ? block.length : 0));
}

export function normalizeAsk(payload: Obj, dateRange: string, dateRangeSource: string): Obj {
  const metadata = isObj(payload.metadata) ? payload.metadata : {};
  const data = payload.data;

  const hasData =
    Array.isArray(data) && data.length > 0 && data.some((b) => Array.isArray(b) && b.length > 0);

  const needsResolution = Boolean(payload.needsResolution);
  const kind = hasData ? "answer" : needsResolution || truthy(payload.candidates) ? "clarification" : "empty";

  const out: Obj = {
    kind,
    hasData,
    needsResolution,
    answer: payload.answer ?? "",
    sessionId: payload.sessionId ?? "",
    requestId: payload.requestId ?? "",
    dateRange,
    dateRangeSource, // regex | llm | manual
    domain: metadata.domain ?? null,
    reportSourceId: metadata.reportSourceId ?? null,
    rowCounts: rowCounts(data),
    data: hasData ? data : [],
  };
  if (truthy(payload.candidates)) out.candidates = payload.candidates;
  if (truthy(payload.insights)) out.insights = payload.insights;
  return out;
}

/** The primary row set — data[0] — as a flat list of objects. */
export function firstRows(data: unknown): Obj[] {
  if (!Array.isArray(data) || !data.length) return [];
  const head = data[0];
  if (Array.isArray(head)) return head.filter(isObj);
  if (isObj(head)) return [head];
  return [];
}
