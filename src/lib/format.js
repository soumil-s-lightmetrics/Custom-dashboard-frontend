export function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return then.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ageHours(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (Date.now() - then.getTime()) / 3600000;
}

export function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Human caption for a tier-2/temporal reduction, so it is never silent. */
export function aggregationNote(agg) {
  if (!agg) return null;
  if (agg.applied === "top_k") {
    return `top ${agg.k} of ${agg.ofCategories?.toLocaleString()}`;
  }
  if (agg.applied === "time_bucket") {
    return `by ${agg.granularity} · ${agg.buckets} buckets`;
  }
  return null;
}
