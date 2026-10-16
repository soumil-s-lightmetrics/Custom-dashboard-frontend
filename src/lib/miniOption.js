/** Strip an ECharts option down to a thumbnail: no axes, labels or legend. */
export function miniOption(option) {
  if (!option) return null;
  const mini = structuredClone(option);
  delete mini.title;
  delete mini.legend;
  delete mini.tooltip;
  delete mini.dataZoom;
  mini.grid = { left: 2, right: 2, top: 4, bottom: 2, containLabel: false };
  mini.animation = false;

  const hide = { show: false };
  if (mini.xAxis) {
    mini.xAxis = {
      ...(Array.isArray(mini.xAxis) ? mini.xAxis[0] : mini.xAxis),
      axisLabel: hide,
      axisTick: hide,
      axisLine: hide,
      splitLine: hide,
    };
  }
  if (mini.yAxis) {
    mini.yAxis = {
      ...(Array.isArray(mini.yAxis) ? mini.yAxis[0] : mini.yAxis),
      axisLabel: hide,
      axisTick: hide,
      axisLine: hide,
      splitLine: hide,
    };
  }

  const series = Array.isArray(mini.series) ? mini.series : [mini.series];
  mini.series = series.filter(Boolean).map((s) => ({
    ...s,
    label: hide,
    ...(s.type === "pie" ? { radius: s.radius || ["35%", "70%"], center: ["50%", "50%"] } : {}),
  }));

  return mini;
}
