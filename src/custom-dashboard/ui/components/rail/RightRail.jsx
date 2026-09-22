import ReactECharts from "echarts-for-react";
import { useEffect, useRef, useState } from "react";
import { miniOption } from "../../lib/miniOption";
import { useDashboardStore } from "../../store/useDashboardStore";
import Icon from "../common/Icon";
import SuggestedCard from "./SuggestedCard";

export default function RightRail({ onInsertReport, onRunSuggested }) {
  const {
    savedReports,
    suggestedReports,
    targetSlotId,
    targetMode,
    railFocus,
    setRailOpen,
    deleteSavedReport,
  } = useDashboardStore();
  const picking = !!targetSlotId;
  const savedRef = useRef(null);
  const tplRef = useRef(null);
  // Which card is showing its delete confirmation. Deleting a report drops its
  // chart config and stored query for good, so it takes two clicks.
  const [confirming, setConfirming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delError, setDelError] = useState(null);

  // Picking an option from the "+" menu must visibly land somewhere.
  useEffect(() => {
    const el = railFocus === "saved" ? savedRef.current : railFocus === "template" ? tplRef.current : null;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [railFocus]);

  return (
    <aside className="rail">
      <button
        className="rail__x no-drag"
        onClick={() => setRailOpen(false)}
        aria-label="Close panel"
      >
        <Icon name="x" size={16} />
      </button>

      <section
        ref={tplRef}
        className={`rail__sec${railFocus === "template" ? " rail__sec--focus" : ""}`}
      >
        <header className="rail__head">
          <h3>Suggested Reports</h3>
          <button className="rail__all">
            View all <Icon name="arrowRight" size={13} />
          </button>
        </header>

        {picking && targetMode === "template" && (
          <div className="rail__hint">Click one to run it into the selected widget.</div>
        )}

        {suggestedReports.length === 0 ? (
          <p className="rail__empty">
            No suggestions for this persona yet.
          </p>
        ) : (
          <div className="rail__stack">
            {suggestedReports.map((r) => (
              <SuggestedCard
                key={r.id}
                report={r}
                picking={picking}
                onRun={onRunSuggested}
              />
            ))}
          </div>
        )}
      </section>

      <section
        ref={savedRef}
        className={`rail__sec${railFocus === "saved" ? " rail__sec--focus" : ""}`}
      >
        <header className="rail__head">
          <h3>Saved Reports</h3>
          <button className="rail__all">
            View all <Icon name="arrowRight" size={13} />
          </button>
        </header>

        {picking && targetMode === "saved" && savedReports.length > 0 && (
          <div className="rail__hint">Click one to insert it into the selected widget.</div>
        )}

        {savedReports.length === 0 ? (
          <p className="rail__empty">
            Nothing saved yet. Build a chart with LISA, then press the save icon
            on the widget — it&apos;ll appear here, ready to drop into any other
            widget.
          </p>
        ) : (
          <div className="rail__stack">
            {savedReports.map((r) => {
              const mini = miniOption(r.chart?.echartsOption);
              const isConfirming = confirming === r.id;
              return (
                <div key={r.id} className="savedcard">
                  <button
                    className={`savedcard__open${picking ? " savedcard--pick" : ""}`}
                    onClick={() => onInsertReport(r)}
                    title={r.description || r.title}
                    disabled={deleting === r.id}
                  >
                    <div className="savedcard__thumb">
                      {mini ? (
                        <ReactECharts
                          option={mini}
                          notMerge
                          style={{ height: "100%", width: "100%" }}
                          opts={{ renderer: "svg" }}
                        />
                      ) : (
                        <Icon name="bar" size={20} />
                      )}
                    </div>
                    <div className="savedcard__name">{r.title}</div>
                    {picking && <span className="savedcard__cta">Insert here →</span>}
                  </button>

                  {!picking && !isConfirming && (
                    <button
                      className="savedcard__del"
                      title="Delete this saved report"
                      aria-label={`Delete ${r.title}`}
                      onClick={() => setConfirming(r.id)}
                      disabled={deleting === r.id}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}

                  {isConfirming && (
                    <div className="savedcard__confirm">
                      <span>
                        {delError || "Delete this report?"}
                      </span>
                      <div className="savedcard__confirmbtns">
                        <button
                          className="savedcard__yes"
                          onClick={async () => {
                            setDeleting(r.id);
                            setDelError(null);
                            try {
                              await deleteSavedReport(r.id);
                              setConfirming(null);
                            } catch (err) {
                              // Keep the card and the panel open so the failure
                              // is visible and the delete can be retried.
                              setDelError(`Couldn't delete — ${err.message}`);
                            } finally {
                              setDeleting(null);
                            }
                          }}
                          disabled={deleting === r.id}
                        >
                          {deleting === r.id ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          className="savedcard__no"
                          onClick={() => {
                            setConfirming(null);
                            setDelError(null);
                          }}
                          disabled={deleting === r.id}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}
