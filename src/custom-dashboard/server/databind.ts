/**
 * Profile rows, sample them for the prompt, and bind the FULL data back in.
 * Port of backend/databind.py.
 *
 * The model does not need the rows — it needs to decide chart type, axis
 * mapping and styling. So it gets a profile plus a small sample, declares a
 * `dataMapping`, and series[].data is then populated here from every row.
 */

import { isObj, type Obj } from "./util";

export const NUMERIC = "numeric";
export const TEMPORAL = "temporal";
export const CATEGORICAL = "categorical";

const DATE_HINT = /(date|time|day|month|week|year|timestamp|utc)/i;
const DATEISH = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/;

export interface Column {
  name: string;
  type: string;
  distinctCount: number;
  nullCount: number;
  examples: string[];
  min?: number;
  max?: number;
}
export interface Profile {
  rowCount: number;
  columns: Column[];
}
export interface Mapping {
  categoryKey: string;
  seriesKeys: string[];
  aggregation: "sum" | "count" | "avg" | "max" | "min";
}

/* ------------------------------------------- difflib.SequenceMatcher port */

/** Total size of the matching blocks, found the way difflib finds them. */
function matchingChars(a: string, b: string): number {
  const walk = (alo: number, ahi: number, blo: number, bhi: number): number => {
    // Longest common block; ties go to the one ending earliest in a, then b.
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let prev = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue;
        const k = (prev.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      prev = next;
    }
    if (!bestsize) return 0;
    return (
      bestsize +
      (alo < besti && blo < bestj ? walk(alo, besti, blo, bestj) : 0) +
      (besti + bestsize < ahi && bestj + bestsize < bhi ? walk(besti + bestsize, ahi, bestj + bestsize, bhi) : 0)
    );
  };
  return walk(0, a.length, 0, b.length);
}

/** SequenceMatcher(None, a, b).ratio(). Strings here are column names, far below autojunk's 200. */
export function ratio(a: string, b: string): number {
  const total = a.length + b.length;
  return total ? (2 * matchingChars(a, b)) / total : 1;
}

/** difflib.get_close_matches(word, possibilities, n, cutoff). */
function closeMatches(word: string, possibilities: Iterable<string>, n: number, cutoff: number): string[] {
  const scored: [number, string][] = [];
  for (const x of possibilities) {
    const score = ratio(x, word); // difflib: seq1 = possibility, seq2 = word
    if (score >= cutoff) scored.push([score, x]);
  }
  scored.sort((p, q) => q[0] - p[0] || (q[1] > p[1] ? 1 : q[1] < p[1] ? -1 : 0));
  return scored.slice(0, n).map(([, x]) => x);
}

/** Exact match, else the single closest column name above cutoff. */
export function resolveColumn(name: unknown, keys: Set<string>, cutoff = 0.8): string | null {
  if (typeof name !== "string") return null;
  if (keys.has(name)) return name;
  const hits = closeMatches(name, keys, 2, cutoff);
  if (!hits.length) return null;
  // Ambiguous: two columns equally close means we'd be guessing.
  if (hits.length > 1 && ratio(name, hits[0]) === ratio(name, hits[1])) return null;
  return hits[0];
}

/* ---------------------------------------------------------------- profile */

export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Python str() for the scalar types JSON can carry. */
function pyStr(v: unknown): string {
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

export function inferType(key: string, values: unknown[]): string {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (!present.length) return CATEGORICAL;
  const numeric = present.filter(isNumber).length;
  if (numeric / present.length > 0.8) return NUMERIC;
  if (DATE_HINT.test(key)) return TEMPORAL;
  const strings = present.filter((v): v is string => typeof v === "string");
  if (strings.length && strings.filter((v) => DATEISH.test(v)).length / strings.length > 0.8) return TEMPORAL;
  return CATEGORICAL;
}

function keysOf(rows: Obj[]): string[] {
  const keys: string[] = [];
  for (const row of rows.slice(0, 200)) {
    for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** A compact summary of the dataset: per-column type, cardinality, examples, range. */
export function profile(rows: Obj[], maxExamples = 5): Profile {
  if (!rows.length) return { rowCount: 0, columns: [] };

  const columns = keysOf(rows).map((key) => {
    const values = rows.map((r) => r[key] ?? null);
    const kind = inferType(key, values);
    const distinct = new Map<string, number>();
    for (const v of values) {
      if (v === null) continue;
      const h = pyStr(v);
      distinct.set(h, (distinct.get(h) ?? 0) + 1);
    }
    const col: Column = {
      name: key,
      type: kind,
      distinctCount: distinct.size,
      nullCount: values.filter((v) => v === null).length,
      examples: [...distinct.keys()].slice(0, maxExamples),
    };
    if (kind === NUMERIC) {
      const nums = values.filter(isNumber);
      if (nums.length) {
        col.min = Math.min(...nums);
        col.max = Math.max(...nums);
      }
    }
    return col;
  });

  return { rowCount: rows.length, columns };
}

/** n evenly spaced rows across the whole set (always including the last). */
export function sample(rows: Obj[], n = 150): Obj[] {
  if (rows.length <= n) return rows;
  const step = rows.length / n;
  const out = Array.from({ length: n }, (_, i) => rows[Math.floor(i * step)]);
  if (!out.includes(rows[rows.length - 1])) out[out.length - 1] = rows[rows.length - 1];
  return out;
}

/** A mapping derived from the profile alone, for when the model's is unusable. */
export function suggestMapping(prof: Profile): Mapping | null {
  const cols = prof.columns ?? [];
  if (!cols.length) return null;

  const temporal = cols.filter((c) => c.type === TEMPORAL);
  const categorical = cols.filter((c) => c.type === CATEGORICAL && c.distinctCount > 1 && c.distinctCount <= 200);
  const numeric = cols.filter((c) => c.type === NUMERIC);

  let category: string;
  if (temporal.length) category = temporal[0].name;
  else if (categorical.length) {
    category = categorical.reduce((best, c) => (c.distinctCount < best.distinctCount ? c : best)).name;
  } else return null;

  return {
    categoryKey: category,
    seriesKeys: numeric.length ? [numeric[0].name] : [],
    aggregation: numeric.length ? "sum" : "count",
  };
}

/** Check the model's dataMapping against the real columns (fuzzy-fixing near misses). */
export function validateMapping(mapping: unknown, rows: Obj[]): [Mapping | null, string | null] {
  if (!isObj(mapping) || !rows.length) return [null, "mapping missing"];

  const keys = new Set<string>();
  for (const row of rows.slice(0, 200)) for (const k of Object.keys(row)) keys.add(k);

  const category = resolveColumn(mapping.categoryKey, keys);
  if (!category) return [null, `categoryKey ${JSON.stringify(mapping.categoryKey)} is not a column`];

  const seriesKeys = (Array.isArray(mapping.seriesKeys) ? mapping.seriesKeys : []).filter(
    (k: unknown): k is string => typeof k === "string" && keys.has(k),
  );

  const allowed = ["sum", "count", "avg", "max", "min"];
  let aggregation = mapping.aggregation || (seriesKeys.length ? "sum" : "count");
  if (!allowed.includes(aggregation)) aggregation = seriesKeys.length ? "sum" : "count";
  if (!seriesKeys.length) aggregation = "count";

  return [{ categoryKey: category, seriesKeys, aggregation }, null];
}

/* -------------------------------------------------------------- aggregate */

export function aggregateRows(
  rows: Obj[],
  mapping: Mapping,
  keyFn?: (v: unknown) => string,
): [string[], Record<string, number[]>] {
  const { categoryKey, seriesKeys, aggregation: how } = mapping;

  interface Bucket {
    count: number;
    sums: Record<string, number>;
    maxes: Record<string, number>;
    mins: Record<string, number>;
  }
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const raw = row[categoryKey] ?? null;
    const cat = keyFn ? keyFn(raw) : raw === null ? "(none)" : pyStr(raw);
    let slot = buckets.get(cat);
    if (!slot) buckets.set(cat, (slot = { count: 0, sums: {}, maxes: {}, mins: {} }));
    slot.count += 1;
    for (const sk of seriesKeys) {
      const v = row[sk];
      if (isNumber(v)) {
        slot.sums[sk] = (slot.sums[sk] ?? 0) + v;
        slot.maxes[sk] = Math.max(slot.maxes[sk] ?? v, v);
        slot.mins[sk] = Math.min(slot.mins[sk] ?? v, v);
      }
    }
  }

  const categories = [...buckets.keys()];
  if (how === "count" || !seriesKeys.length) {
    return [categories, { count: categories.map((c) => buckets.get(c)!.count) }];
  }

  const series: Record<string, number[]> = {};
  for (const sk of seriesKeys) {
    series[sk] = categories.map((c) => {
      const slot = buckets.get(c)!;
      const total = slot.sums[sk] ?? 0;
      if (how === "sum") return total;
      if (how === "avg") return slot.count ? Math.round((total / slot.count) * 1e4) / 1e4 : 0;
      if (how === "max") return slot.maxes[sk] ?? 0;
      return slot.mins[sk] ?? 0;
    });
  }
  return [categories, series];
}

/* ------------------------------------------------------------------- bind */

function seriesFamily(option: Obj): string {
  const series = option.series;
  if (Array.isArray(series) && isObj(series[0])) return series[0].type || "bar";
  if (isObj(series)) return series.type || "bar";
  return "bar";
}

/**
 * Write the real categories and values into an LLM-designed option. The model
 * chose type and styling from a sample; this replaces the sampled numbers with
 * the aggregate of every row.
 */
export function bind(option: Obj, categories: string[], seriesValues: Record<string, number[]>): Obj {
  option = { ...option };
  const family = seriesFamily(option);
  const names = Object.keys(seriesValues);

  if (family === "pie") {
    const values = seriesValues[names[0]];
    const raw = option.series;
    const template: Obj = Array.isArray(raw) && isObj(raw[0]) ? { ...raw[0] } : isObj(raw) ? { ...raw } : {};
    template.type = "pie";
    template.data = categories.map((c, i) => ({ name: c, value: values[i] }));
    option.series = [template];
    delete option.xAxis;
    delete option.yAxis;
    return option;
  }

  const existing = option.series;
  const templates: Obj[] = Array.isArray(existing)
    ? existing.filter(isObj).map((s) => ({ ...s }))
    : isObj(existing)
      ? [{ ...existing }]
      : [];

  option.series = names.map((name, idx) => {
    const base: Obj = { ...(templates[idx] ?? templates[0] ?? {}) };
    base.type ??= family;
    if (names.length > 1 || !base.name) base.name = name;
    base.data =
      family === "scatter"
        ? categories.map((c, i) => ({ name: c, value: seriesValues[name][i] }))
        : seriesValues[name];
    return base;
  });

  let xAxis = option.xAxis;
  if (Array.isArray(xAxis)) xAxis = xAxis[0] ?? {};
  xAxis = isObj(xAxis) ? { ...xAxis } : {};
  xAxis.type = "category";
  xAxis.data = categories;
  if (categories.length > 8) xAxis.axisLabel = { ...(xAxis.axisLabel ?? {}), rotate: 45 };
  option.xAxis = xAxis;

  let yAxis = option.yAxis;
  if (Array.isArray(yAxis)) yAxis = yAxis[0] ?? {};
  yAxis = isObj(yAxis) ? { ...yAxis } : {};
  yAxis.type ??= "value";
  option.yAxis = yAxis;

  return option;
}
