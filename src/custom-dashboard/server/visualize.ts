/**
 * ECharts generation. Port of backend/visualize.py, which itself vendors the
 * parent repo's assistant/report_and_visuals.py (prompt + sanitizers).
 *
 * Size tiering: tier 0 sends the full data; tiers 1-2 send a profile plus a
 * sample, have the model declare a `dataMapping`, and bind every row here.
 */

import * as aggregate from "./aggregate";
import { settings } from "./config";
import * as databind from "./databind";
import { ApiError } from "./errors";
import { jsonCompletion, llmConfigured } from "./llm";
import { isObj, type Obj } from "./util";

// Tier thresholds, in rows.
const TIER0_MAX_ROWS = 200;
const TIER1_MAX_ROWS = 2000;
const SAMPLE_ROWS = 150;

// gpt-4o has a 128k window; leave room for the system prompt and the reply.
const MAX_DATA_TOKENS = 60_000;

/** Past this many value labels (categories x series) labels go off; the tooltip carries values. */
export const LABEL_DENSITY_MAX = 14;

/** Room above the plot so a "position: top" label on the tallest point is not clipped. */
export const LABEL_HEADROOM = 16;

/* ----------------------------------------------------------------- prompt */

const VISUALIZATION_SYSTEM_PROMPT = `You are an expert data visualization assistant that generates ECharts configurations.

    CRITICAL CHART SELECTION RULES (you MUST follow these):

    ANALYSIS PROCESS:
    Step 1: Look at the data structure (object vs array, keys vs values)
    Step 2: Count the number of data points
    Step 3: Identify if it's time-based, categorical, or relational
    Step 4: If chart type is specified by user, use it. Otherwise, auto-select based on rules below.
    Step 5: Generate complete ECharts config

    AUTOMATIC CHART SELECTION RULES (when chart type is NOT specified):

    Use PIE CHART when:
    - Data is a flat dictionary with categorical keys and numeric values
    - Showing parts of a whole or percentage distribution
    - Typically 2-10 categories

    Use BAR CHART when:
    - Comparing categorical data across different categories
    - Time-based data with discrete intervals (daily, monthly, yearly)
    - Ranking or comparing quantities
    - More than 10 categories (pie becomes hard to read)

    Use LINE CHART when:
    - Time series data showing trends over continuous time
    - Data has clear temporal progression
    - Showing rate of change or patterns over time

    Use SCATTER CHART when:
    - Showing distribution or frequency of categorical events
    - Correlation between categories and values
    - Individual data points matter (not aggregated trends)

    DESIGN REQUIREMENTS:
    - Vibrant gradients: #10b981, #3b82f6, #f59e0b, #ef4444, #8b5cf6, #ec4899
    - Rounded corners for bars: borderRadius: [8, 8, 0, 0]
    - Gray (#e5e7eb) for zero/null values
    - Interactive tooltips with proper formatting
    - Modern animations (animationEasing: 'elasticOut')

    CHART-SPECIFIC REQUIREMENTS:

    PIE CHARTS:
    - radius: ['0%', '70%']
    - ALWAYS include label configuration:
      label: { show: true, formatter: '{b}: {d}%', fontSize: 12 }
    - borderRadius: 8
    - emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }

    BAR CHARTS:
    - Rotate labels if more than 8 categories: xAxis.axisLabel.rotate: 45
    - Show grid: grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
    - barWidth: '60%'
    - ALWAYS include label on bars:
      label: { show: true, position: 'top', formatter: '{c}' }

    LINE CHARTS:
    - smooth: true for smooth curves
    - areaStyle for area fill with transparency: areaStyle: { opacity: 0.3 }
    - ALWAYS include label configuration:
      label: { show: true, position: 'top', formatter: '{c}' }
    - symbol: 'circle', symbolSize: 6

    SCATTER CHARTS:
    - symbolSize: 10-15 for visibility
    - label: { show: false } (do not show labels on scatter points by default)
    - For categorical scatter plots, structure data with SINGLE VALUE (not array):
      data: [{name: 'Category1', value: 10}, {name: 'Category2', value: 20}]
    - Set xAxis.type: 'category' and xAxis.data: ['Category1', 'Category2', ...]

    TOOLTIP CONFIGURATION:
    - Use simple string template formatter:
      tooltip: { trigger: 'item', formatter: '{b}<br/>Count: {c}' }
    - {b} = data point name, {c} = y-axis value

    IMPORTANT NOTES:
    - DO NOT use array values like [x, y] for categorical scatter - use single value
    - DO NOT use {c0}, {c1}, {@[0]}, {@[1]} - these don't work in string formatters
    - DO NOT use function formatters - they get serialized as strings in JSON
    - Use meaningful axis labels: xAxis.name and yAxis.name based on data fields

    LABEL CONSISTENCY:
    - ALWAYS set label.show to true or false explicitly in series configuration
    - Never omit label configuration - it must be present for all chart types
    - For charts where labels may clutter (many data points), use: label: { show: false }

    Return ONLY valid JSON:
    {
    "reasoning": "Explain why you chose this type based on data structure",
    "config": { complete ECharts option object }
    }`;

// Appended only on tiers 1 and 2, where the model sees a sample.
const MAPPING_INSTRUCTION = `

    YOU ARE SEEING A SAMPLE, NOT THE FULL DATASET.
    The full data has many more rows. You must ALSO return a "dataMapping" that
    says how to aggregate the FULL dataset. The caller will compute the real
    values from every row and substitute them into your config.

    "dataMapping": {
      "categoryKey": "<exact column name to group by — must appear in the profile>",
      "seriesKeys": ["<exact numeric column name(s) to plot>"],
      "aggregation": "sum" | "count" | "avg" | "max" | "min"
    }

    Rules for dataMapping:
    - Use EXACT column names from the COLUMN PROFILE. Never invent one.
    - Use "count" with an empty seriesKeys list when the question is about how
      many rows fall into each category.
    - Prefer a temporal column as categoryKey for trends; otherwise the
      lowest-cardinality categorical column.
    - Put realistic placeholder numbers in config.series[].data — they will be
      replaced. Getting the STRUCTURE right is what matters.

    Return ONLY valid JSON:
    {
    "reasoning": "...",
    "dataMapping": { ... },
    "config": { complete ECharts option object }
    }`;

/* ------------------------------------------------ analyze_data_structure */

export function analyzeDataStructure(data: unknown): string {
  const out: string[] = [];
  const isNum = (v: unknown) => typeof v === "number" || typeof v === "boolean";

  if (isObj(data)) {
    const values = Object.values(data);
    if (values.every(isNum)) {
      out.push(`- Flat dictionary with ${values.length} categories`);
      out.push(`- Keys: ${Object.keys(data).slice(0, 5).join(", ")}`);
      out.push("- Values are numeric (totals/counts)");
      out.push("- SUGGESTION: This structure is ideal for PIE CHART");
    } else if (values.some((v) => Array.isArray(v) || isObj(v))) {
      for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value)) continue;
        out.push(`- Key '${key}' contains array of ${value.length} items`);
        if (isObj(value[0])) {
          out.push(`  - Each item has keys: ${Object.keys(value[0]).join(", ")}`);
          if ("date" in value[0] || "time" in value[0]) {
            out.push("  - SUGGESTION: Time-based data, use BAR or LINE CHART");
          }
        }
      }
    }
  } else if (Array.isArray(data)) {
    out.push(`- Array with ${data.length} items`);
    if (isObj(data[0])) {
      out.push(`- Each item has keys: ${Object.keys(data[0]).join(", ")}`);
      if ("date" in data[0] || "time" in data[0]) {
        out.push("- Contains date/time field");
        out.push("- SUGGESTION: Use BAR CHART for time series");
      }
    }
  }
  return out.length ? out.join("\n") : "Unknown structure";
}

/* ------------------------------------------------------------- sanitizers */
// Mandatory: an LLM-emitted function-valued formatter breaks setOption().

const FN_PATTERN = /^\s*function\s*\(|^\s*\(.*\)\s*=>|^\s*new\s+Function\s*\(/;
const FORMATTER_FALLBACK = "{b}: {c}";
const RAW_FN =
  /:\s*(?:new\s+Function\s*\([^)]*\)|function\s*\([^)]*\)\s*\{[^}]*\}|\([^)]*\)\s*=>\s*[^,}\]]+)/g;

/** Replace raw JavaScript values in the JSON TEXT with null, before parsing. */
export const sanitizeJsInJson = (text: string) => text.replace(RAW_FN, ": null");

/** Recursively remove JavaScript function strings from an ECharts config. */
export function sanitizeEchartsConfig(obj: unknown): unknown {
  const walk = (node: unknown, key?: string): unknown => {
    if (isObj(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, k)]));
    if (Array.isArray(node)) return node.map((item) => walk(item, key));
    if (typeof node === "string" && FN_PATTERN.test(node)) {
      return key === "formatter" ? FORMATTER_FALLBACK : null;
    }
    return node;
  };
  return walk(obj);
}

/* --------------------------------------------------- layout normalisation */

const labelSlots = (series: Obj[]) =>
  series.reduce((n, s) => n + (Array.isArray(s.data) ? s.data.length : 0), 0);

/**
 * Show value labels only when they can be read. Returns whether they show.
 * The prompt tells the model to ALWAYS label, but it judges density from a
 * sample; the bound chart can have hundreds of points.
 */
function applyLabelPolicy(series: Obj[]): boolean {
  const show = labelSlots(series) <= LABEL_DENSITY_MAX;
  for (const s of series) {
    if (s.type === "pie") continue;
    if (!show) {
      s.label = { show: false };
      continue;
    }
    const label: Obj = { ...(s.label ?? {}) };
    // Keep a cartesian-safe formatter ("{c} trips"), never {d} (pie-only).
    const existing = label.formatter;
    const safe =
      typeof existing === "string" && !existing.includes("{d}") && (existing.includes("{c}") || existing.includes("{b}"));
    Object.assign(label, {
      show: true,
      position: "top",
      formatter: safe ? existing : "{c}",
      fontSize: 10,
      color: "#374151",
    });
    s.label = label;
  }
  return show;
}

/**
 * One consistent frame on every chart: legend on top, plot below, no chart
 * title (the widget header already names it), readable labels, and an
 * axis-triggered tooltip that is easy to hit.
 */
export function normalizeLayout<T>(option: T): T {
  if (!isObj(option)) return option;

  const opt: Obj = { ...option };
  delete opt.title;

  let series = opt.series;
  if (isObj(series)) series = [series];
  series = (Array.isArray(series) ? series : []).filter(isObj);
  if (!series.length) return opt as T;

  const isPie = series.some((s: Obj) => s.type === "pie");
  const wantsLegend = isPie || series.length > 1;
  let topGap: number;
  if (wantsLegend) {
    opt.legend = {
      top: 6,
      left: "center",
      orient: "horizontal",
      // Long names would wrap into rows and eat the plot.
      type: "scroll",
      itemWidth: 11,
      itemHeight: 11,
      itemGap: 12,
      pageIconSize: 9,
      textStyle: { fontSize: 11, color: "#374151" },
    };
    topGap = 40;
  } else {
    delete opt.legend;
    topGap = 16;
  }

  opt.animationEasing = opt.animationEasing ?? "elasticOut";

  if (isPie) {
    delete opt.xAxis;
    delete opt.yAxis;
    delete opt.grid;
    for (const s of series as Obj[]) {
      if (s.type !== "pie") continue;
      const r = s.radius;
      const isDonut = Array.isArray(r) && r.length === 2 && !["0", "0%"].includes(String(r[0]));
      s.radius = isDonut ? ["42%", "70%"] : ["0%", "70%"];
      s.center = ["50%", "58%"];
      // Percentages inside: outside labels with leader lines overlap at widget size.
      s.label = { show: true, position: "inside", formatter: "{d}%", fontSize: 10, color: "#fff" };
      delete s.labelLine;
      delete s.avoidLabelOverlap;
    }
  } else {
    const labelled = applyLabelPolicy(series);
    opt.grid = {
      top: topGap + (labelled ? LABEL_HEADROOM : 0),
      left: 10,
      right: 18,
      bottom: 6,
      containLabel: true,
    };
    // Axis names overprint the legend in the top-left corner.
    for (const axisKey of ["xAxis", "yAxis"]) {
      const axis = opt[axisKey];
      for (const ax of Array.isArray(axis) ? axis : [axis]) {
        if (isObj(ax)) delete ax.name;
      }
    }
    const tooltip: Obj = isObj(opt.tooltip) ? { ...opt.tooltip } : {};
    tooltip.trigger = "axis";
    // A string formatter renders only the FIRST series under an axis trigger.
    if (series.length > 1 && typeof tooltip.formatter === "string") delete tooltip.formatter;
    opt.tooltip = tooltip;
  }

  opt.series = series;
  return opt as T;
}

/* --------------------------------------------------------------- tiering */

function estimateTokens(payload: unknown): number {
  try {
    return Math.floor(JSON.stringify(payload).length / 4);
  } catch {
    return MAX_DATA_TOKENS + 1;
  }
}

function chooseTier(rows: Obj[]): number {
  if (!rows.length) return 3;
  if (rows.length <= TIER0_MAX_ROWS && estimateTokens(rows) <= MAX_DATA_TOKENS) return 0;
  if (rows.length <= TIER1_MAX_ROWS) return 1;
  return 2;
}

async function callModel(system: string, user: string): Promise<Obj> {
  if (!llmConfigured()) {
    throw new ApiError("openai_not_configured", "CD_OPENAI_API_KEY is not set — cannot generate charts.", 503);
  }
  const text = sanitizeJsInJson(
    await jsonCompletion({ model: settings.vizModel, system, user, temperature: 0.3 }),
  );
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ApiError("viz_bad_json", `Model returned unparseable JSON: ${(err as Error).message}`, 502);
  }
}

function chartTypeInstruction(chartType?: string | null): string {
  if (chartType?.trim()) {
    return `CHART_TYPE SPECIFIED: ${chartType}\nIMPORTANT: You MUST use this chart type.`;
  }
  return (
    "CHART_TYPE: Not specified\n" +
    "IMPORTANT: Automatically select the most appropriate chart type " +
    "(PIE, BAR, LINE, or SCATTER) based on the AUTOMATIC CHART SELECTION " +
    "RULES and data structure."
  );
}

/** Full data in the prompt — the parent's original behaviour. */
async function tier0(data: unknown, chartType?: string | null, question?: string | null) {
  const user = `Analyze this data and generate the appropriate chart:

            DATA STRUCTURE ANALYSIS:
            ${analyzeDataStructure(data)}

            ${chartTypeInstruction(chartType)}

            RAW DATA:
            ${JSON.stringify(data, null, 2)}

            ${question ? `USER REQUEST: ${question}` : ""}`;

  const result = await callModel(VISUALIZATION_SYSTEM_PROMPT, user);
  if (!isObj(result.config)) throw new ApiError("viz_no_config", "Model returned no chart config", 502);
  return {
    echartsOption: normalizeLayout(sanitizeEchartsConfig(result.config)),
    reasoning: result.reasoning ?? "",
    tier: 0,
    aggregation: { applied: "none" } as Obj,
  };
}

/** Profile + sample to the model; bind every row here afterwards. */
async function tier12(rows: Obj[], chartType: string | null | undefined, question: string | null | undefined, tier: number) {
  const prof = databind.profile(rows);
  const sampleRows = databind.sample(rows, SAMPLE_ROWS);

  const user = `Analyze this dataset and generate the appropriate chart.

            ROW COUNT (full dataset): ${prof.rowCount}

            COLUMN PROFILE:
            ${JSON.stringify(prof.columns, null, 2)}

            ${chartTypeInstruction(chartType)}

            SAMPLE ROWS (${sampleRows.length} of ${prof.rowCount}):
            ${JSON.stringify(sampleRows, null, 2)}

            ${question ? `USER REQUEST: ${question}` : ""}`;

  const result = await callModel(VISUALIZATION_SYSTEM_PROMPT + MAPPING_INSTRUCTION, user);
  if (!isObj(result.config)) throw new ApiError("viz_no_config", "Model returned no chart config", 502);

  let [mapping, problem] = databind.validateMapping(result.dataMapping, rows);
  if (!mapping) {
    // A hallucinated column would silently produce an empty chart.
    console.warn(`[visualize] unusable dataMapping (${problem}) — deriving one from the profile`);
    mapping = databind.suggestMapping(prof);
  }
  if (!mapping) {
    throw new ApiError("too_broad", "This result has no column that can be grouped into a chart.", 422);
  }

  // A temporal category is bucketed and sorted, never ranked.
  const colType = Object.fromEntries(prof.columns.map((c) => [c.name, c.type]));
  const colDistinct = Object.fromEntries(prof.columns.map((c) => [c.name, c.distinctCount]));
  const categoryKey = mapping.categoryKey;
  const isTemporal = colType[categoryKey] === databind.TEMPORAL;

  let keyFn: ((v: unknown) => string) | undefined;
  let granularity: string | null = null;
  if (isTemporal && (colDistinct[categoryKey] ?? 0) > aggregate.TEMPORAL_BUCKET_THRESHOLD) {
    granularity = aggregate.chooseGranularity(rows.map((r) => r[categoryKey]));
    keyFn = aggregate.bucketer(granularity);
  }

  let [categories, seriesValues] = databind.aggregateRows(rows, mapping, keyFn);
  let aggRecord: Obj = { applied: "none", ofCategories: categories.length };

  if (isTemporal) {
    [categories, seriesValues] = aggregate.sortChronologically(categories, seriesValues);
    if (granularity) {
      aggRecord = {
        applied: "time_bucket",
        granularity,
        ofCategories: colDistinct[categoryKey] ?? categories.length,
        buckets: categories.length,
      };
    }
  } else if (tier === 2 || categories.length > aggregate.DEFAULT_TOP_K) {
    [categories, seriesValues, aggRecord] = aggregate.topK(categories, seriesValues);
  }

  aggRecord.ofRows = rows.length;
  aggRecord.mapping = mapping;

  const option = normalizeLayout(
    databind.bind(sanitizeEchartsConfig(result.config) as Obj, categories, seriesValues),
  );
  return { echartsOption: option, reasoning: result.reasoning ?? "", tier, aggregation: aggRecord };
}

function tooBroad(rows: Obj[], question?: string | null) {
  const prof = databind.profile(rows);
  const cols = prof.columns.map((c) => c.name);
  return {
    kind: "too_broad",
    render: "table",
    tier: 3,
    message:
      `This result has ${prof.rowCount.toLocaleString("en-US")} rows across ` +
      `${cols.length} columns with no obvious way to group it into a chart. ` +
      "Showing it as a table instead.",
    suggestedRewrites: [
      question ? `${question} — grouped by type` : "Group the results by category",
      question ? `${question} — top 10 only` : "Show only the top 10",
    ],
    columns: cols,
  };
}

/** Entry point. `data` is the verbatim list[list[row]] from talk-to-data. */
export async function generate(data: unknown, chartType?: string | null, question?: string | null): Promise<Obj> {
  let rows: unknown = data;
  if (Array.isArray(data) && data.length && Array.isArray(data[0])) rows = data[0];

  if (!Array.isArray(rows) || !rows.length || !isObj(rows[0])) {
    // Not row-shaped (e.g. a flat object of totals) — fine as long as it is small.
    if (estimateTokens(data) <= MAX_DATA_TOKENS) return tier0(data, chartType, question);
    throw new ApiError("too_broad", "Result is too large to visualize.", 422);
  }

  const objRows = rows as Obj[];
  if (databind.profile(objRows).columns.length > 40) return tooBroad(objRows, question);

  const tier = chooseTier(objRows);
  if (tier === 0) return tier0(objRows, chartType, question);
  if (tier === 1 || tier === 2) {
    try {
      return await tier12(objRows, chartType, question, tier);
    } catch (err) {
      if (err instanceof ApiError && err.code === "too_broad") return tooBroad(objRows, question);
      throw err;
    }
  }
  return tooBroad(objRows, question);
}
