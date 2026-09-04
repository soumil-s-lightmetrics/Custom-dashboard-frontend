import ReactECharts from "echarts-for-react";
import { useState } from "react";
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

      <div className="widget__body">
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
          />
        ) : (
          !pending && <div className="widget__empty">No chart yet</div>
        )}
      </div>
    </div>
  );
}
