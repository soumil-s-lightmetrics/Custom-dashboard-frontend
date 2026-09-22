import ReactECharts from "echarts-for-react";
import { useEffect, useRef, useState } from "react";
import { miniOption } from "../../lib/miniOption";
import Icon from "../common/Icon";

/**
 * One suggested report: a chart thumbnail, a title, and — only when the report
 * declares them — a text box per parameter.
 *
 * The thumbnail is a PREVIEW baked into the catalog, never live data. Running
 * the card sends the assembled question through the ordinary chat path, so the
 * widget always gets a chart built from a fresh query.
 */
export default function SuggestedCard({ report, picking, onRun }) {
  const params = report.query?.params || [];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const firstInput = useRef(null);

  useEffect(() => {
    if (open) firstInput.current?.focus();
  }, [open]);

  const mini = miniOption(report.chart?.echartsOption);
  const ready = params.every((p) => (values[p.key] || "").trim());

  function run() {
    if (params.length && !ready) return;
    onRun(report, values);
    setOpen(false);
    setValues({});
  }

  // No parameters — nothing to ask, so one click runs it.
  function activate() {
    if (!params.length) onRun(report, {});
    else setOpen((v) => !v);
  }

  return (
    <div className={`sugcard${open ? " sugcard--open" : ""}`}>
      <button
        className={`sugcard__open${picking ? " sugcard--pick" : ""}`}
        onClick={activate}
        title={report.query?.questionTemplate || report.title}
        aria-expanded={params.length ? open : undefined}
      >
        <div className="sugcard__thumb">
          {mini ? (
            <ReactECharts
              option={mini}
              notMerge
              style={{ height: "100%", width: "100%" }}
              opts={{ renderer: "svg" }}
            />
          ) : (
            <Icon name={report.chart?.chartType || "bar"} size={20} />
          )}
        </div>
        <div className="sugcard__name">{report.title}</div>
        <div className="sugcard__desc">{report.description}</div>
        {picking && <span className="sugcard__cta">Run into this widget →</span>}
      </button>

      {open && params.length > 0 && (
        <div className="sugcard__form">
          {params.map((p, i) => (
            <label key={p.key} className="sugcard__field">
              <span>{p.label}</span>
              <input
                ref={i === 0 ? firstInput : undefined}
                value={values[p.key] || ""}
                placeholder={p.placeholder}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [p.key]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") run();
                  if (e.key === "Escape") setOpen(false);
                }}
              />
            </label>
          ))}
          <div className="sugcard__actions">
            <button className="sugcard__run" onClick={run} disabled={!ready}>
              Run
            </button>
            <button className="sugcard__cancel" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
