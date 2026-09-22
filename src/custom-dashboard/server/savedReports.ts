/**
 * Saved reports — the "Saved Reports" rail (data/saved_reports.json).
 * Port of backend/saved_reports.py.
 *
 * Re-using a report REPLAYS its `query` against talk-to-data rather than
 * serving the stored snapshot. `askedAt` is what lets queryRefresh re-anchor
 * absolute dates in the question. The originating sessionId is provenance
 * only and is NEVER replayed.
 */

import { retimeQuery } from "./queryRefresh";
import * as storage from "./storage";
import { clone, hex, isObj, nowIso, type Obj } from "./util";

const FILE = "saved_reports";
const DEFAULT = { version: 1, reports: [] as Obj[] };

export async function listAll(includeSnapshot = false): Promise<Obj[]> {
  const reports = (await storage.read(FILE, DEFAULT)).reports ?? [];
  if (includeSnapshot) return reports;
  // Keep the metadata, drop the rows — the rail only needs a thumbnail.
  return reports.map((r) => {
    const { data: _data, ...snapshot } = r.snapshot ?? {};
    return { ...r, snapshot };
  });
}

export async function get(reportId: string): Promise<Obj | null> {
  const reports = (await storage.read(FILE, DEFAULT)).reports ?? [];
  return reports.find((r) => r.id === reportId) ?? null;
}

/** The saved query, stamped with when it was asked (older slots: when captured). */
function queryForReplay(slot: Obj) {
  const query = clone(slot.query);
  if (!isObj(query)) return query;
  if (!query.askedAt) query.askedAt = slot.snapshot?.capturedAt || nowIso();
  return query;
}

export async function create(
  slot: Obj,
  opts: { title?: string | null; description?: string; persona?: string | null; sessionId?: string | null },
) {
  const report = {
    id: `rep_${hex(12)}`,
    title: opts.title || slot.title || "Untitled widget",
    description: opts.description ?? "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    persona: opts.persona ?? null,
    titleSource: opts.title ? "manual" : "llm",
    query: queryForReplay(slot),
    result: clone(slot.result ?? null),
    chart: clone(slot.chart ?? null),
    snapshot: clone(slot.snapshot ?? null),
    render: slot.render ?? "chart",
    originatingSessionId: opts.sessionId ?? null, // provenance only
  };
  await storage.mutate(FILE, DEFAULT, (doc) => {
    (doc.reports ??= []).unshift(report);
  });
  return report;
}

export async function patch(reportId: string, fields: Obj) {
  await storage.mutate(FILE, DEFAULT, (doc) => {
    const r = (doc.reports ?? []).find((x) => x.id === reportId);
    if (!r) return;
    for (const k of ["title", "description"]) {
      if (k in fields) {
        r[k] = fields[k];
        if (k === "title") r.titleSource = "manual";
      }
    }
    r.updatedAt = nowIso();
  });
  return get(reportId);
}

export async function remove(reportId: string): Promise<boolean> {
  const existed = (await get(reportId)) !== null;
  await storage.mutate(FILE, DEFAULT, (doc) => {
    doc.reports = (doc.reports ?? []).filter((r) => r.id !== reportId);
  });
  return existed;
}

/**
 * Deep-copy a report into the shape a slot expects, re-anchoring the query to
 * now. Deliberately carries no session id — the slot starts a fresh thread.
 */
export function toSlotPayload(report: Obj): Obj {
  const [query] = retimeQuery(clone(report.query));
  return {
    state: "filled",
    title: report.title,
    source: { kind: "saved", savedReportId: report.id, templateId: null },
    query,
    result: clone(report.result ?? null),
    chart: clone(report.chart ?? null),
    snapshot: clone(report.snapshot ?? null),
    render: report.render ?? "chart",
  };
}
