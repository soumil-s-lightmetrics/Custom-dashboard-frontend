/**
 * Keep a chart readable when there are too many categories.
 * Port of backend/aggregate.py.
 *
 * Nobody can read a 5,000-bar chart, so top-K + Other is what the chart should
 * have been. The reduction is never silent: the `aggregation` record lets the
 * widget caption "top 25 of 5,431".
 */

export const DEFAULT_TOP_K = 25;
export const OTHER_LABEL = "Other";

/** Above this many distinct timestamps, a temporal axis must be bucketed. */
export const TEMPORAL_BUCKET_THRESHOLD = 40;

export type Series = Record<string, number[]>;

// The same four layouts Python's strptime accepted (%m/%d/%H… take 1-2 digits).
const DT_FORMATS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/,
  /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2}):(\d{1,2})$/,
  /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2})$/,
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
];

/**
 * A naive timestamp as epoch ms (treating the wall clock as UTC), or null.
 * The timezone offset and fractional seconds are dropped so the same day
 * written two ways lands in one bucket.
 */
export function parseDt(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return null;

  const text = value
    .trim()
    .replace(/Z/g, "")
    .replace(/\.\d+$/, "")
    .replace(/[+-]\d{2}:?\d{2}$/, "")
    .trim();

  for (const fmt of DT_FORMATS) {
    const m = fmt.exec(text);
    if (!m) continue;
    const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map((v) => (v === undefined ? undefined : +v)) as number[];
    if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59 || d < 1) continue;
    const dt = new Date(0);
    dt.setUTCFullYear(y, mo - 1, d);
    if (dt.getUTCMonth() !== mo - 1) continue; // day past month end
    dt.setUTCHours(h, mi, s, 0);
    return dt.getTime();
  }
  return null;
}

/** Pick hour/day/month from the span the data actually covers. */
export function chooseGranularity(values: unknown[]): "hour" | "day" | "month" {
  const parsed = values.map(parseDt).filter((v): v is number => v !== null);
  if (!parsed.length) return "day";
  const spanDays = (Math.max(...parsed) - Math.min(...parsed)) / 86_400_000;
  if (spanDays <= 2) return "hour";
  if (spanDays <= 92) return "day";
  return "month";
}

const p2 = (n: number) => String(n).padStart(2, "0");

export function bucketLabel(value: unknown, granularity: string): string {
  const ms = parseDt(value);
  if (ms === null) return value === null || value === undefined ? "(unknown)" : String(value);
  const d = new Date(ms);
  const ymd = `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}`;
  if (granularity === "hour") return `${ymd}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:00`;
  if (granularity === "month") return ymd;
  return `${ymd}-${p2(d.getUTCDate())}`;
}

export const bucketer = (granularity: string) => (v: unknown) => bucketLabel(v, granularity);

/**
 * Order a time axis by time, not by magnitude. Ranking a temporal axis (as
 * topK does) turns a trend line into noise, so it is never reduced by rank.
 */
export function sortChronologically(categories: string[], series: Series): [string[], Series] {
  const key = (i: number) => parseDt(categories[i]) ?? Infinity;
  const order = categories
    .map((_, i) => i)
    .sort((a, b) => key(a) - key(b) || (categories[a] < categories[b] ? -1 : categories[a] > categories[b] ? 1 : 0));
  return [
    order.map((i) => categories[i]),
    Object.fromEntries(Object.entries(series).map(([name, vals]) => [name, order.map((i) => vals[i])])),
  ];
}

/** Keep the k largest categories by the primary series; fold the rest into Other. */
export function topK(
  categories: string[],
  series: Series,
  k = DEFAULT_TOP_K,
): [string[], Series, Record<string, unknown>] {
  const total = categories.length;
  if (total <= k) return [categories, series, { applied: "none", ofCategories: total }];

  const primary = Object.values(series)[0];
  // Stable descending sort, like Python's sorted(..., reverse=True).
  const ranked = categories.map((_, i) => i).sort((a, b) => primary[b] - primary[a]);
  const keep = ranked.slice(0, k).sort((a, b) => a - b);
  const rest = ranked.slice(k);

  const newCategories = [...keep.map((i) => categories[i]), OTHER_LABEL];
  const newSeries: Series = {};
  for (const [name, values] of Object.entries(series)) {
    newSeries[name] = [...keep.map((i) => values[i]), rest.reduce((sum, i) => sum + values[i], 0)];
  }
  return [newCategories, newSeries, { applied: "top_k", k, ofCategories: total, otherLabel: OTHER_LABEL }];
}
