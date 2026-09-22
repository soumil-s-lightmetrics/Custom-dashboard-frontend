/**
 * Chart types shown in the popover. `local` marks transitions we can perform
 * on the existing option without a model call.
 */
export const CHART_TYPES = [
  { id: "table", label: "Table" },
  { id: "bar", label: "Bar Chart" },
  { id: "line", label: "Line Chart" },
  { id: "area", label: "Area Chart" },
  { id: "pie", label: "Pie Chart" },
  { id: "donut", label: "Donut Chart" },
  { id: "scatter", label: "Scatter Plot" },
];

export const CARTESIAN = new Set(["bar", "line", "area"]);
export const RADIAL = new Set(["pie", "donut"]);

/** True when the switch is a pure local transform (no network at all). */
export function canTransformLocally(from, to) {
  if (!from || from === to) return false;
  if (from === "table" || to === "table") return false;
  if (CARTESIAN.has(from) && CARTESIAN.has(to)) return true;
  if (RADIAL.has(from) && RADIAL.has(to)) return true;
  return false;
}

export function labelFor(id) {
  return CHART_TYPES.find((c) => c.id === id)?.label || "Chart";
}
