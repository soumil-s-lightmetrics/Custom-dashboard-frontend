import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import ChatPanel from "../components/chat/ChatPanel";
import Icon from "../components/common/Icon";
import DashboardGrid from "../components/grid/DashboardGrid";
import RightRail from "../components/rail/RightRail";
import { assembleQuestion } from "../lib/suggestedQuery";
import { canTransformLocally } from "../lib/chartTypes";
import { switchChartType } from "../lib/chartTransform";
import { useChatStore } from "../store/useChatStore";
import { useDashboardStore } from "../store/useDashboardStore";
import { useSessionStore } from "../store/useSessionStore";

export default function BuilderScreen() {
  const persona = useSessionStore((s) => s.persona);
  const D = useDashboardStore();
  const C = useChatStore();
  const [booted, setBooted] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameOpts, setNameOpts] = useState(null);

  useEffect(() => {
    D.loadAll()
      .then(() => setBooted(true))
      .catch(() => setBooted(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setNameDraft(D.name);
  }, [D.name]);


  const seenPersona = useRef(persona);
  useEffect(() => {
    if (seenPersona.current === persona) return;
    seenPersona.current = persona;
    D.refreshSuggestedReports().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  // Restore the transcript for whichever slot is targeted.
  useEffect(() => {
    if (!D.targetSlotId) return;
    api
      .history(D.targetSlotId)
      .then((r) => C.loadThread(r.thread))
      .catch(() => C.reset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D.targetSlotId]);

  /* ---------------------------------------------------------- ask -> chart */
  const build = useCallback(
    async (question, dateRange) => {
      const slotId = await D.ensureTarget();
      C.setSending(true);
      C.setPendingDateQuestion(null);
      // A dateRange here can only have come from the follow-up picker, so
      // the bubble can show the suffix immediately rather than after the ask.
      C.push({
        role: "user",
        text: question,
        dateRange,
        dateRangeSource: dateRange ? "manual" : undefined,
      });
      D.setError(slotId, null);
      D.setPending(slotId, "asking");

      try {
        const res = await api.ask({ question, slotId, dateRange });

        // Couldn't resolve a time window — ask rather than guess.
        if (res.kind === "needs_daterange") {
          C.setPendingDateQuestion(question);
          C.push({ role: "bot", text: res.message, kind: "needs_daterange" });
          D.setPending(slotId, null);
          return;
        }

        C.replaceLast({ dateRange: res.dateRange, dateRangeSource: res.dateRangeSource });

        if (!res.hasData) {
          C.push({
            role: "bot",
            text:
              res.kind === "empty"
                ? `${res.answer || "No rows matched."}\n\nNothing came back for that — try widening the time range or loosening the filter.`
                : res.answer,
            kind: res.kind,
          });
          D.setPending(slotId, null);
          return;
        }

        C.push({ role: "bot", text: res.answer, kind: "answer" });
        D.setPending(slotId, "visualizing");

        const viz = await api.visualize({
          resultId: res.resultId,
          question,
          chartType: "auto",
        });

        const isTable = viz.kind === "too_broad";
        if (isTable) {
          C.push({ role: "bot", text: viz.message, kind: "answer" });
        }

        const { slot } = await api.fillSlot(slotId, {
          resultId: res.resultId,
          query: {
            question,
            dateRange: res.dateRange,
            dateRangeSource: res.dateRangeSource,
            tagIds: [],
          },
          result: {
            domain: res.domain,
            reportSourceId: res.reportSourceId,
            answer: res.answer,
            upstreamRequestId: res.requestId,
          },
          chart: isTable
            ? {}
            : {
                chartType: viz.chartType === "auto"
                  ? viz.echartsOption?.series?.[0]?.type || "bar"
                  : viz.chartType,
                echartsOption: viz.echartsOption,
                reasoning: viz.reasoning,
                aggregation: viz.aggregation,
              },
          render: isTable ? "table" : "chart",
        });

        D.replaceSlot(slot);
        D.setPending(slotId, null);
        D.clearTarget();

        // Title comes after the chart is up — never blocks the render.
        api
          .name({ resultId: res.resultId, question })
          .then(({ reportName }) => api.patchSlot(slotId, { title: reportName }))
          .then(({ slot: named }) => D.replaceSlot(named))
          .catch(() => {});
      } catch (err) {
        D.setError(slotId, err.message);
        C.push({ role: "bot", text: `Something went wrong: ${err.message}` });
        D.setPending(slotId, null);
      } finally {
        C.setSending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ------------------------------------------------- chart type switching */
  const changeType = useCallback(async (slot, nextId) => {
    const current = slot.render === "table" ? "table" : slot.chart?.chartType;
    if (current === nextId) return;

    // Table both ways is a pure render switch — no work at all.
    if (nextId === "table" || current === "table") {
      const { slot: updated } = await api.patchSlot(slot.i, {
        render: nextId === "table" ? "table" : "chart",
      });
      D.replaceSlot(updated);
      return;
    }

    // bar<->line<->area and pie<->donut are deterministic: no network at all.
    if (canTransformLocally(current, nextId) || slot.chart?.echartsOption) {
      const local = switchChartType(slot.chart.echartsOption, current, nextId);
      if (local) {
        const chart = { ...slot.chart, chartType: nextId, echartsOption: local };
        D.replaceSlot({ ...slot, chart });
        api.patchSlot(slot.i, { chart }).catch(() => {});
        return;
      }
    }

    // Structural change — one local visualize call, still no talk-to-data.
    D.setPending(slot.i, "visualizing");
    try {
      const viz = await api.visualize({
        slotId: slot.i,
        chartType: nextId,
        question: slot.query?.question,
      });
      const chart = {
        chartType: nextId,
        echartsOption: viz.echartsOption,
        reasoning: viz.reasoning,
        aggregation: viz.aggregation,
      };
      const { slot: updated } = await api.patchSlot(slot.i, { chart });
      D.replaceSlot(updated);
    } catch (err) {
      D.setError(slot.i, err.message);
    } finally {
      D.setPending(slot.i, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------------- actions */
  const save = useCallback(async (slot) => {
    await api.saveReport({ slotId: slot.i, title: slot.title });
    await D.refreshSavedReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async (slot) => {
    D.setPending(slot.i, "refreshing");
    D.setError(slot.i, null);
    try {
      const { slot: updated } = await api.refreshSlot(slot.i);
      D.replaceSlot(updated);
    } catch (err) {
      // Keep the existing snapshot rather than blanking the widget.
      D.setError(slot.i, `Couldn't refresh — showing older data. ${err.message}`);
    } finally {
      D.setPending(slot.i, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filled widget: clear it back to an empty slot, keeping the grid position.
  const remove = useCallback(async (slot) => {
    await D.removeSlot(slot.i, "clear");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already-empty slot: delete it outright so the grid closes up.
  const removeEmpty = useCallback(async (slot) => {
    await D.removeSlot(slot.i, "remove");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Insert a saved report, then immediately refresh it for current numbers. */
  const insertReport = useCallback(async (report) => {
    const slotId = await D.ensureTarget();
    const { slot } = await api.fillSlot(slotId, { savedReportId: report.id });
    D.replaceSlot(slot);
    D.clearTarget();
    refresh(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A suggested report is just a canned question once its parameters are
   * filled in, so it goes through the same build() path as anything typed
   * into the chat. The report's stored echartsOption is a rail thumbnail only
   * and deliberately does NOT come along — the widget gets a chart generated
   * from the live result.
   */
  const runSuggested = useCallback(
    (report, values) => build(assembleQuestion(report, values)),
    [build],
  );

  async function suggestName() {
    const { suggestions } = await api.suggestDashboardName();
    setNameOpts(suggestions);
  }

  if (!booted) {
    return (
      <div className="center-page">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div
      className="builder"
      style={{
        gridTemplateColumns: `${D.chatOpen ? "352px" : "0px"} minmax(0,1fr) ${
          D.railOpen ? "320px" : "0px"
        }`,
      }}
    >
      {D.chatOpen ? <ChatPanel onBuild={build} /> : <div />}

      <main className="builder__main">
        <header className="builder__bar">
          <input
            className="builder__name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft !== D.name && D.setName(nameDraft)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Dashboard name"
          />
          <div className="builder__baractions">
            <button className="btn btn--ghost" onClick={suggestName}>
              <Icon name="sparkle" size={15} /> Suggest with AI
            </button>
            <button className="btn btn--ghost" onClick={() => D.addSlot()}>
              <Icon name="plus" size={15} /> Add widget
            </button>
            {!D.chatOpen && (
              <button className="btn btn--ghost" onClick={() => D.setChatOpen(true)}>
                <Icon name="sparkle" size={15} /> Chat
              </button>
            )}
            {!D.railOpen && (
              <button className="btn btn--ghost" onClick={() => D.setRailOpen(true)}>
                <Icon name="file" size={15} /> Reports
              </button>
            )}
          </div>

          {nameOpts && (
            <div className="namepick">
              {nameOpts.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    D.setName(n);
                    setNameOpts(null);
                  }}
                >
                  {n}
                </button>
              ))}
              <button className="namepick__x" onClick={() => setNameOpts(null)}>
                Cancel
              </button>
            </div>
          )}
        </header>

        <DashboardGrid
          onChangeType={changeType}
          onSave={save}
          onRefresh={refresh}
          onRemove={remove}
          onRemoveEmpty={removeEmpty}
        />
      </main>

      {D.railOpen ? (
        <RightRail onInsertReport={insertReport} onRunSuggested={runSuggested} />
      ) : (
        <div />
      )}
    </div>
  );
}
