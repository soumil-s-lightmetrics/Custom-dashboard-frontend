/**
 * Dashboard state: slots, layout, name, persona. Port of backend/dashboards.py,
 * generalised from the single hard-coded "default" dashboard to many.
 *
 * Stored as data/dashboards.json in the original format:
 *   {"version": 1, "dashboards": {"<id>": {id, name, nameSource, persona, ...}}}
 *
 * A slot and a saved report share the IDENTICAL query/result/chart/snapshot
 * sub-objects, so save and insert are pure deep-copies. A slot deliberately
 * holds no sessionId — that lives in chatLog's thread for the slot.
 */

import { ApiError, notFound } from "./errors";
import { getPersona } from "./personas";
import * as storage from "./storage";
import { clone, hex, nowIso, type Obj } from "./util";

const FILE = "dashboards";
const DEFAULT_SLOTS = 4;

export const SNAPSHOT_MAX_ROWS = 500;
export const SNAPSHOT_MAX_BYTES = 262_144;

interface Doc {
  version: number;
  dashboards: Record<string, Obj>;
}
const DEFAULT_DOC: Doc = { version: 1, dashboards: {} };

export const now = nowIso;

export function emptySlot(slotId: string): Obj {
  return {
    i: slotId,
    state: "empty",
    title: null,
    source: null,
    query: null,
    result: null,
    chart: null,
    snapshot: null,
  };
}

// Random, not positional ("slot_1"): chat threads are keyed by slot id alone,
// so ids must be unique across every dashboard.
const newSlotId = () => `slot_${hex(8)}`;

function defaultLayout(slotIds: string[]) {
  const grid = (cols: number, w: number) =>
    slotIds.map((i, idx) => ({
      i,
      x: (idx * w) % cols,
      y: Math.floor((idx * w) / cols) * 8,
      w,
      h: 8,
      minW: 2,
      minH: 3,
    }));
  return { lg: grid(12, 6), md: grid(8, 4), sm: grid(4, 4) };
}

function blankDashboard(id: string, name: string, persona: string | null): Obj {
  const slotIds = Array.from({ length: DEFAULT_SLOTS }, newSlotId);
  return {
    id,
    name,
    nameSource: "default",
    persona,
    updatedAt: now(),
    globalFilters: { dateRange: null, tagIds: [] },
    slots: slotIds.map(emptySlot),
    layout: defaultLayout(slotIds),
  };
}

/* ------------------------------------------------------------ collection */

/** Personas "skip" and "generalist" mean: every dashboard. */
export const showsAll = (persona?: string | null) => !persona || persona === "generalist";

export async function list(persona?: string | null) {
  const doc = await storage.read(FILE, DEFAULT_DOC);
  return Object.values(doc.dashboards ?? {})
    .filter((d) => showsAll(persona) || d.persona === persona)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(summary);
}

/** Just enough for the picker card — never the snapshot rows. */
function summary(d: Obj) {
  const slots: Obj[] = d.slots ?? [];
  const filled = slots.filter((s) => s.state === "filled");
  const preview = filled.find((s) => s.render !== "table" && s.chart?.echartsOption);
  return {
    id: d.id,
    name: d.name,
    persona: d.persona ?? null,
    updatedAt: d.updatedAt,
    totalSlots: slots.length,
    filledSlots: filled.length,
    widgetTitles: filled.map((s) => s.title).filter(Boolean),
    preview: preview ? { chartType: preview.chart.chartType, echartsOption: preview.chart.echartsOption } : null,
  };
}

export async function create(opts: { name?: string; persona?: string | null }) {
  const persona = getPersona(opts.persona).id;
  const name = (opts.name ?? "").trim() || `${getPersona(persona).title} Dashboard`;
  const id = `dash_${hex(10)}`;
  const dash = blankDashboard(id, name, persona);
  if (opts.name?.trim()) dash.nameSource = "manual";
  await storage.mutate(FILE, DEFAULT_DOC, (doc) => {
    doc.dashboards ??= {};
    doc.dashboards[id] = dash;
  });
  return dash;
}

/** Deletes the dashboard. Returns its slot ids so their chat threads can go too. */
export async function remove(id: string): Promise<string[]> {
  let slotIds = null as string[] | null;
  await storage.mutate(FILE, DEFAULT_DOC, (doc) => {
    const dash = doc.dashboards?.[id];
    if (!dash) return;
    slotIds = (dash.slots ?? []).map((s: Obj) => s.i);
    delete doc.dashboards[id];
  });
  if (slotIds === null) throw notFound("dashboard");
  return slotIds;
}

/* ------------------------------------------------------- one dashboard */

export async function get(id: string): Promise<Obj> {
  const doc = await storage.read(FILE, DEFAULT_DOC);
  const dash = doc.dashboards?.[id];
  if (!dash) throw notFound("dashboard");
  return dash;
}

async function mutateOne(id: string, fn: (dash: Obj) => void): Promise<Obj> {
  let out = null as Obj | null;
  await storage.mutate(FILE, DEFAULT_DOC, (doc) => {
    const dash = doc.dashboards?.[id];
    if (!dash) return;
    fn(dash);
    dash.updatedAt = now();
    out = clone(dash);
  });
  if (!out) throw notFound("dashboard");
  return out;
}

export async function getSlot(id: string, slotId: string): Promise<Obj | null> {
  const dash = await get(id);
  return (dash.slots ?? []).find((s: Obj) => s.i === slotId) ?? null;
}

/**
 * Find a slot by id alone. Slot ids are unique across dashboards, so callers
 * that only know the slot (older clients, visualize's snapshot fallback) still
 * resolve it; pass dashboardId when known to skip the scan.
 */
export async function findSlot(slotId: string, dashboardId?: string | null) {
  const doc = await storage.read(FILE, DEFAULT_DOC);
  const candidates = dashboardId
    ? [doc.dashboards?.[dashboardId]].filter(Boolean)
    : Object.values(doc.dashboards ?? {});
  for (const dash of candidates as Obj[]) {
    const slot = (dash.slots ?? []).find((s: Obj) => s.i === slotId);
    if (slot) return { dashboard: dash, slot };
  }
  return null;
}

const PATCHABLE = ["name", "nameSource", "persona", "globalFilters"];

export function patch(id: string, fields: Obj) {
  return mutateOne(id, (dash) => {
    for (const k of PATCHABLE) {
      if (k in fields) dash[k] = fields[k];
    }
  });
}

export function setLayout(id: string, layout: Obj) {
  return mutateOne(id, (dash) => {
    dash.layout = layout;
  });
}

export async function addSlot(id: string) {
  const slotId = newSlotId();
  const dashboard = await mutateOne(id, (dash) => {
    dash.slots.push(emptySlot(slotId));
    dash.layout ??= {};
    for (const [bp, w] of [
      ["lg", 6],
      ["md", 4],
      ["sm", 4],
    ] as const) {
      const entries: Obj[] = (dash.layout[bp] ??= []);
      const maxY = entries.reduce((m, e) => Math.max(m, e.y + e.h), 0);
      entries.push({ i: slotId, x: 0, y: maxY, w, h: 8, minW: 2, minH: 3 });
    }
  });
  return { slotId, dashboard };
}

/**
 * Cap the stored rows. echartsOption is always kept whole and is
 * self-contained, so a truncated snapshot still renders at its current type.
 */
export function makeSnapshot(data: unknown) {
  let rows = data;
  let truncated = false;
  let counts: number[] = [];
  if (Array.isArray(data) && data.length && Array.isArray(data[0])) {
    rows = data.map((block: unknown[]) => block.slice(0, SNAPSHOT_MAX_ROWS));
    truncated = data.some((b: unknown[]) => b.length > SNAPSHOT_MAX_ROWS);
    counts = data.map((b: unknown[]) => b.length);
  }

  const payload = JSON.stringify(rows);
  if (payload.length > SNAPSHOT_MAX_BYTES && Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
    rows = (rows as unknown[][]).map((block) => block.slice(0, 100));
    truncated = true;
  }

  return {
    capturedAt: now(),
    truncated,
    rowCounts: counts,
    bytes: payload.length,
    data: rows,
  };
}

function slotIndex(dash: Obj, slotId: string): number {
  const idx = (dash.slots ?? []).findIndex((s: Obj) => s.i === slotId);
  if (idx < 0) throw notFound("slot");
  return idx;
}

export async function fillSlot(id: string, slotId: string, widget: Obj): Promise<Obj> {
  const dash = await mutateOne(id, (d) => {
    const idx = slotIndex(d, slotId);
    d.slots[idx] = { ...clone(widget), i: slotId, state: "filled" };
  });
  return dash.slots[slotIndex(dash, slotId)];
}

export async function patchSlot(id: string, slotId: string, fields: Obj): Promise<Obj> {
  const dash = await mutateOne(id, (d) => {
    const slot = d.slots[slotIndex(d, slotId)];
    for (const k of ["title", "chart", "snapshot", "render"]) {
      if (k in fields) slot[k] = fields[k];
    }
  });
  return dash.slots[slotIndex(dash, slotId)];
}

/**
 * Clear or delete a slot. The caller must also drop the slot's chat thread —
 * otherwise an unrelated new widget here inherits the old conversation.
 */
export function clearSlot(id: string, slotId: string, removeIt = false) {
  return mutateOne(id, (dash) => {
    if (removeIt) {
      dash.slots = dash.slots.filter((s: Obj) => s.i !== slotId);
      for (const bp of Object.keys(dash.layout ?? {})) {
        dash.layout[bp] = dash.layout[bp].filter((e: Obj) => e.i !== slotId);
      }
    } else {
      const idx = dash.slots.findIndex((s: Obj) => s.i === slotId);
      if (idx >= 0) dash.slots[idx] = emptySlot(slotId);
    }
  });
}

export function assertLayout(layout: unknown): asserts layout is Obj {
  if (layout === null || typeof layout !== "object" || Array.isArray(layout)) {
    throw new ApiError("bad_request", "'layout' must be an object");
  }
}
