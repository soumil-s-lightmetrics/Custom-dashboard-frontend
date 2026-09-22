import ReactECharts from "echarts-for-react";
import { useEffect, useRef, useState } from "react";
import { aggregationNote, ageHours, relativeTime } from "../../lib/format";
import Icon from "../common/Icon";
import ChartTypeMenu from "./ChartTypeMenu";
import WidgetTable from "./WidgetTable";

export default function WidgetCard({
  slot,
  index,
  pending,
  error,
  onChangeType,
  onSave,
  onRefresh,
  onRemove,
}) {
  const [menu, setMenu] = useState(false);
  const chart = slot.chart || {};
  const snap = slot.snapshot || {};
  const render = slot.render || "chart";
  const hours = ageHours(snap.capturedAt);
  const note = aggregationNote(chart.aggregation);

  // echarts-for-react draws the chart once at the container's width, then
  // fixes that width in pixels. It also ignores the first resize after that
  // (to protect the opening animation). A widget that loads with the page is
  // still narrow while the grid measures itself, so the one resize that
  // reports the real width gets ignored and the chart stays collapsed. We
  // watch the widget ourselves and resize on every change, plus once when
  // the chart is ready, whichever comes first. 'auto' matters: a plain
  // resize() keeps the fixed pixel width.
  const bodyRef = useRef(null);
  const chartRef = useRef(null);
  const fitChart = () => {
    const inst = chartRef.current;
    if (inst && !inst.isDisposed()) inst.resize({ width: "auto", height: "auto" });
  };
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fitChart);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="widget">
      <header className="widget__head">
        <div className="widget__titles">
          <div className="widget__title" title={slot.title || ""}>
            {slot.title || `Widget ${index + 1}`}
          </div>
          <div className="widget__meta">
            {snap.capturedAt && (
              <span className={hours > 24 ? "widget__stale" : undefined}>
                as of {relativeTime(snap.capturedAt)}
              </span>
            )}
            {note && <span className="widget__agg">· {note}</span>}
          </div>
        </div>

        <div className="widget__tools no-drag">
          <button title="Refresh" onClick={onRefresh}>
            <Icon name="refresh" size={15} />
          </button>
          <button title="Save to reports" onClick={onSave}>
            <Icon name="save" size={15} />
          </button>
          <button title="Chart type" onClick={() => setMenu((v) => !v)}>
            <Icon name={render === "table" ? "table" : chart.chartType || "bar"} size={15} />
          </button>
          <button title="Remove" onClick={onRemove}>
            <Icon name="trash" size={15} />
          </button>
          {menu && (
            <ChartTypeMenu
              active={render === "table" ? "table" : chart.chartType}
              onClose={() => setMenu(false)}
              onPick={(id) => {
                setMenu(false);
                onChangeType(id);
              }}
            />
          )}
        </div>
      </header>

      <div className="widget__body" ref={bodyRef}>
        {pending && (
          <div className="widget__overlay">
            <span className="spinner" />
            <span>
              {pending === "asking"
                ? "Querying your data…"
                : pending === "refreshing"
                  ? "Refreshing…"
                  : "Designing the chart…"}
            </span>
          </div>
        )}

        {error && <div className="widget__error">{error}</div>}

        {render === "table" ? (
          <WidgetTable data={snap.data} />
        ) : chart.echartsOption ? (
          <ReactECharts
            option={chart.echartsOption}
            // Required: without notMerge, switching bar->pie leaves orphaned
            // xAxis/yAxis config behind and the chart renders wrong.
            notMerge
            lazyUpdate
            style={{ height: "100%", width: "100%" }}
            onChartReady={(inst) => {
              chartRef.current = inst;
              fitChart();
            }}
          />
        ) : (
          !pending && <div className="widget__empty">No chart yet</div>
        )}
      </div>
    </div>
  );
}
