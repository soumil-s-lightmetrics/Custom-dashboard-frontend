import { CARTESIAN, RADIAL } from "./chartTypes";

/**
 * Everything a pie cannot represent, parked on the option so the trip back to
 * a cartesian type can restore it.
 *
 * Going bar -> pie throws away the axes and the series' bar styling, and
 * normalizeLayout additionally strips the series itemStyle colour (a single
 * gradient would paint every slice the same). Without somewhere to keep them,
 * bar -> pie -> bar came back as a DIFFERENT bar chart: default-blue instead
 * of the original gradient, and with the axis label rotation gone so the
 * category names collided and ECharts dropped most of them.
 *
 * Serialises with the option (it is plain JSON) and is dropped the moment it
 * is used. ECharts ignores unknown top-level keys.
 */
const  STASH = "__cartesianStash";

// {d} is share-of-total — a pie-only placeholder. ECharts has no value for it
// on a bar or line and prints the token verbatim, which is where the literal
// "{d}%" on the bars came from.
const PIE_PLACEHOLDER = /\{d\}/;

/**
 * Make a label safe for a cartesian chart.
 *
 * Only rewrites labels that came off a pie, so a genuinely custom cartesian
 * formatter ("{c} events") survives a bar <-> line switch untouched.
 */
function cartesianLabel(label) {
  if (!label) return { show: true, position: "top", formatter: "{c}" };

  const fromPie =
    (typeof label.formatter === "string" && PIE_PLACEHOLDER.test(label.formatter)) ||
    label.position === "inside";
  if (!fromPie) return label;

  const { formatter, position, color, ...rest } = label;
  // `color` was #fff to read against a slice; outside a bar that is invisible.
  return { ...rest, show: label.show !== false, position: "top", formatter: "{c}" };
}

function seriesList(option) {
  const raw = Array.isArray(option?.series) ? option.series : [option?.series];
  return raw.filter(Boolean);
}

/** Snapshot the cartesian-only parts of an option, before it becomes a pie. */
function stashCartesian(option) {
  return {
    xAxis: option.xAxis,
    yAxis: option.yAxis,
    series: seriesList(option).map((s) => ({
      label: s.label,
      itemStyle: s.itemStyle,
      barWidth: s.barWidth,
      areaStyle: s.areaStyle,
      smooth: s.smooth,
      symbol: s.symbol,
      symbolSize: s.symbolSize,
    })),
  };
}

/**
 * Put the stashed parts back, BEFORE the family transform runs — so switching
 * bar -> pie -> line still gets line's own treatment of areaStyle/smooth
 * rather than the bar styling it was saved with.
 */
function restoreCartesian(option) {
  const stash = option[STASH];
  if (!stash) return option;
  const next = { ...option };
  if (stash.xAxis) next.xAxis = stash.xAxis;
  if (stash.yAxis) next.yAxis = stash.yAxis;
  next.series = seriesList(option).map((s, i) => {
    const kept = stash.series?.[i];
    if (!kept) return s;
    const merged = { ...s };
    for (const [k, v] of Object.entries(kept)) {
      if (v !== undefined) merged[k] = v;
    }
    return merged;
  });
  return next;
}

/**
 * Mirrors LABEL_DENSITY_MAX / LABEL_HEADROOM in backend/visualize.py. Keep the
 * pairs in step — a locally switched chart must be framed exactly like a
 * server-generated one.
 */
const LABEL_DENSITY_MAX = 14;
const LABEL_HEADROOM = 16;

function labelSlots(series) {
  return series.reduce(
    (n, s) => n + (Array.isArray(s.data) ? s.data.length : 0),
    0,
  );
}

/**
 * Show value labels only when they can be read, and return whether they show.
 *
 * A 30-day trend with a number over every point, or a multi-series bar chart
 * with one over every bar, is unreadable at widget size — and at "position:
 * top" the tallest point's label is clipped by the top of the plot. Past the
 * density limit the tooltip carries the numbers instead.
 */
function applyLabelPolicy(series) {
  const show = labelSlots(series) <= LABEL_DENSITY_MAX;
  series.forEach((s) => {
    if (s.type === "pie") return;
    if (!show) {
      s.label = { show: false };
      return;
    }
    // Keep a model-authored formatter when it is cartesian-safe ("{c} trips"
    // reads better than "{c}"), but never keep {d} — share-of-total is
    // pie-only and ECharts prints the token verbatim on a bar or line.
    const existing = s.label?.formatter;
    const safe =
      typeof existing === "string" &&
      !existing.includes("{d}") &&
      (existing.includes("{c}") || existing.includes("{b}"));
    s.label = {
      ...(s.label || {}),
      show: true,
      position: "top",
      formatter: safe ? existing : "{c}",
      fontSize: 10,
      color: "#374151",
    };
  });
  return show;
}

/**
 * Mirrors backend visualize.normalize_layout: legend pinned to the top, plot
 * centred below it, chart title dropped (the widget header names it), value
 * labels shown only when they can be read. Applied after every local transform
 * so a locally-switched chart is framed identically to a server-generated one.
 */
export function normalizeLayout(option) {
  if (!option) return option;
  const next = { ...option };
  delete next.title;

  const series = (Array.isArray(next.series) ? next.series : [next.series]).filter(
    Boolean,
  );
  if (!series.length) return next;

  const isPie = series.some((s) => s.type === "pie");
  const wantsLegend = isPie || series.length > 1;

  
  if (wantsLegend) {
    next.legend = {
      top: 6,
      left: "center",
      orient: "horizontal",
      type: "scroll",
      itemWidth: 11,
      itemHeight: 11,
      itemGap: 12,
      pageIconSize: 9,
      textStyle: { fontSize: 11, color: "#374151" },
    };
  } else {
    delete next.legend;
  }
  const topGap = wantsLegend ? 40 : 16;
  // same family transforms, 
  if (isPie) {
    delete next.xAxis;
    delete next.yAxis;
    delete next.grid;
    next.series = series.map((s) => {
      if (s.type !== "pie") return s;
      const r = s.radius;
      const isDonut =
        Array.isArray(r) && r.length === 2 && String(r[0]) !== "0" && String(r[0]) !== "0%";
      const out = { ...s };
      out.radius = isDonut ? ["42%", "70%"] : ["0%", "70%"];
      out.center = ["50%", "58%"];
      out.label = {
        show: true,
        position: "inside",
        formatter: "{d}%",
        fontSize: 10,
        color: "#fff",
      };
      delete out.labelLine;
      // A bar series carries a single itemStyle colour (often a gradient).
      // Left in place every pie slice renders that same colour and the chart
      // reads as one flat disc — drop it so ECharts cycles its palette.
      if (out.itemStyle) {
        const { color, ...rest } = out.itemStyle;
        out.itemStyle = rest;
      }
      return out;
    });
  } else {
    const shaped = series.map((s) => ({ ...s }));
    const labelled = applyLabelPolicy(shaped);
    next.grid = {
      top: topGap + (labelled ? LABEL_HEADROOM : 0),
      left: 10,
      right: 18,
      bottom: 6,
      containLabel: true,
    };
    // A yAxis `name` renders in the top-left corner, right under the legend,
    // and the two overprint. Drop both axis names — the widget header names
    // the chart already.
    for (const key of ["xAxis", "yAxis"]) {
      const axis = next[key];
      if (Array.isArray(axis)) {
        next[key] = axis.map((ax) => {
          if (!ax || typeof ax !== "object") return ax;
          const { name, ...rest } = ax;
          return rest;
        });
      } else if (axis && typeof axis === "object") {
        const { name, ...rest } = axis;
        next[key] = rest;
      }
    }
    // With labels off the tooltip is the only readout, so it has to be easy to
    // hit: "item" means landing on a 6px symbol, "axis" reads the whole column.
    const tooltip =
      next.tooltip && typeof next.tooltip === "object" ? { ...next.tooltip } : {};
    tooltip.trigger = "axis";
    // A string formatter renders only the first series under an axis trigger.
    if (shaped.length > 1 && typeof tooltip.formatter === "string") {
      delete tooltip.formatter;
    }
    next.tooltip = tooltip;
    next.series = shaped;
  }

  return next;
}

/**
 * Deterministic chart-type switches, done on the existing option.
 *
 * bar<->line<->area and pie<->donut only change series.type / areaStyle /
 * radius, so they need no model call and no re-query — instant and free.
 * Anything structural (scatter, or a change of axis shape) falls through to
 * the visualize endpoint.
 */
export function transformLocally(option, to) {
  if (!option) return null;
  const next = structuredClone(option);
  const series = Array.isArray(next.series) ? next.series : [next.series];

  if (CARTESIAN.has(to)) {
    next.series = series.filter(Boolean).map((s) => {
      const out = { ...s };
      out.type = to === "area" ? "line" : to;
      // Unconditional: a pie's "{d}%" inside-white label must never survive
      // onto a bar or line, whether or not there is a stash to restore from.
      out.label = cartesianLabel(out.label);
      // Radii belong to a pie; left in place ECharts keeps drawing one.
      delete out.radius;
      delete out.center;
      if (to === "area") {
        out.areaStyle = out.areaStyle || { opacity: 0.3 };
        out.smooth = out.smooth ?? true;
      } else if (to === "line") {
        delete out.areaStyle;
        out.smooth = out.smooth ?? true;
        out.symbol = out.symbol || "circle";
        out.symbolSize = out.symbolSize || 6;
      } else {
        delete out.areaStyle;
        delete out.smooth;
        out.barWidth = out.barWidth || "60%";
        out.itemStyle = { ...(out.itemStyle || {}), borderRadius: [8, 8, 0, 0] };
      }
      return out;
    });
    return next;
  }

  if (RADIAL.has(to)) {
    next.series = series.filter(Boolean).map((s) => {
      const out = { ...s };
      out.type = "pie";
      out.radius = to === "donut" ? ["40%", "70%"] : ["0%", "70%"];
      out.label = out.label || { show: true, formatter: "{b}: {d}%", fontSize: 12 };
      delete out.areaStyle;
      delete out.barWidth;
      return out;
    });
    return next;
  }

  return null;
}

/**
 * Cartesian option -> pie-shaped series data, so a bar chart can become a pie
 * locally. Returns null when the shape doesn't allow it.
 */
export function toRadialData(option) {
  const cats = option?.xAxis?.data;
  const series = Array.isArray(option?.series) ? option.series[0] : option?.series;
  if (!Array.isArray(cats) || !Array.isArray(series?.data)) return null;
  return cats.map((name, i) => {
    const v = series.data[i];
    return { name, value: typeof v === "object" ? v?.value : v };
  });
}

/** Pie-shaped series data -> categories + values for a cartesian chart. */
export function toCartesianData(option) {
  const series = Array.isArray(option?.series) ? option.series[0] : option?.series;
  if (!Array.isArray(series?.data)) return null;
  if (typeof series.data[0] !== "object") return null;
  return {
    categories: series.data.map((d) => d.name),
    values: series.data.map((d) => d.value),
  };
}

/** Full local switch including the data reshape between families. */
export function switchChartType(option, from, to) {
  if (!option) return null;

  const sameFamily =
    (CARTESIAN.has(from) && CARTESIAN.has(to)) ||
    (RADIAL.has(from) && RADIAL.has(to));
  if (sameFamily) {
    const next = transformLocally(option, to);
    return next ? normalizeLayout(next) : null;
  }

  if (CARTESIAN.has(from) && RADIAL.has(to)) {
    const data = toRadialData(option);
    if (!data) return null;
    // Taken before the transform, while the axes and bar styling still exist.
    // Cloned so it cannot alias sub-objects of the option it came from.
    const stash = structuredClone(stashCartesian(option));
    const next = transformLocally(option, to);
    if (!next) return null;
    next.series[0].data = data;
    delete next.xAxis;
    delete next.yAxis;
    next[STASH] = stash;
    return normalizeLayout(next);
  }

  if (RADIAL.has(from) && CARTESIAN.has(to)) {
    const flat = toCartesianData(option);
    if (!flat) return null;
    // Restore first, so the family transform below still gets to apply its own
    // rules on top of the original styling.
    const next = transformLocally(restoreCartesian(option), to);
    if (!next) return null;
    next.series[0].data = flat.values;

    // Merge onto the restored axis rather than replacing it: that axis carries
    // the original label rotation, without which long category names overlap
    // and ECharts silently drops all but a couple of them.
    const x = { ...(next.xAxis || {}), type: "category", data: flat.categories };
    if (!x.axisLabel && flat.categories.length > 8) x.axisLabel = { rotate: 45 };
    next.xAxis = x;
    next.yAxis = { type: "value", ...(next.yAxis || {}) };

    delete next[STASH];
    return normalizeLayout(next);
  }

  return null;
}
