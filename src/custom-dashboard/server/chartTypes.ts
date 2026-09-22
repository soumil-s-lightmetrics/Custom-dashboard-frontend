/** UI chart types and the phrase each one puts into the chart prompt. */

export const CHART_TYPES = [
  { id: "table", label: "Table", upstream: null },
  { id: "bar", label: "Bar Chart", upstream: "bar" },
  { id: "line", label: "Line Chart", upstream: "line" },
  { id: "area", label: "Area Chart", upstream: "line chart with areaStyle fill (area chart)" },
  { id: "pie", label: "Pie Chart", upstream: "pie" },
  { id: "donut", label: "Donut Chart", upstream: "pie chart rendered as a donut using radius ['40%','70%']" },
  { id: "scatter", label: "Scatter Plot", upstream: "scatter" },
] as const;

const UPSTREAM: Record<string, string | null> = Object.fromEntries(CHART_TYPES.map((c) => [c.id, c.upstream]));

/** The prompt phrase for a UI chart id; null for "auto" (let the model choose). */
export function promptChartType(chartId: string): string | null {
  return chartId === "auto" ? null : (UPSTREAM[chartId] ?? null);
}
