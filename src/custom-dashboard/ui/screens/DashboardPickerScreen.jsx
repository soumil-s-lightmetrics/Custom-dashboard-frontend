"use client";

import ReactECharts from "echarts-for-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Icon from "../components/common/Icon";
import StepDots from "../components/common/StepDots";
import { relativeTime } from "../lib/format";
import { miniOption } from "../lib/miniOption";
import { useSessionStore } from "../store/useSessionStore";
import { ROOT, dashboardPath } from "../lib/routes";

/**
 * Step 2: pick (or create) a dashboard. Only dashboards tagged with the chosen
 * persona are listed; after Skip (persona null) every dashboard is.
 */
export default function DashboardPickerScreen() {
  const router = useRouter();
  const { userName, persona } = useSessionStore();
  const showsAll = !persona || persona === "generalist";

  const [personas, setPersonas] = useState([]);
  const [dashboards, setDashboards] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .personas()
      .then((r) => setPersonas(r.personas || []))
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    api
      .listDashboards(showsAll ? null : persona)
      .then((r) => setDashboards(r.dashboards || []))
      .catch((err) => setError(err.message));
  }, [persona, showsAll]);

  const titleOf = useMemo(() => {
    const map = Object.fromEntries(personas.map((p) => [p.id, p.title]));
    return (id) => map[id] || "Everything";
  }, [personas]);

  async function create() {
    setCreating(true);
    try {
      const { dashboard } = await api.createDashboard({ persona: persona || "generalist" });
      router.push(dashboardPath(dashboard.id));
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  const onRenamed = (id, name) =>
    setDashboards((list) => list.map((d) => (d.id === id ? { ...d, name } : d)));
  const onDeleted = (id) => setDashboards((list) => list.filter((d) => d.id !== id));

  return (
    <div className="persona picker">
      <div className="persona__inner picker__inner">
        <StepDots count={3} active={1} />

        <h1 className="persona__title">
          {userName ? `Hi ${userName}, pick a dashboard` : "Pick a dashboard"}
        </h1>
        <p className="persona__sub">
          {showsAll ? (
            <>Showing every dashboard. </>
          ) : (
            <>
              Showing dashboards for <strong>{titleOf(persona)}</strong>.{" "}
            </>
          )}
          <Link className="picker__role" href={ROOT}>
            Change role
          </Link>
        </p>

        {error && <div className="error-banner picker__error">{error}</div>}

        {dashboards === null && !error ? (
          <div className="picker__loading">
            <span className="spinner" />
          </div>
        ) : (
          <div className="picker__grid">
            <button type="button" className="picker-new" onClick={create} disabled={creating}>
              <span className="picker-new__icon">
                <Icon name="plus" size={20} />
              </span>
              <span className="picker-new__title">{creating ? "Creating…" : "New dashboard"}</span>
              <span className="picker-new__desc">
                Start with four empty widgets
                {showsAll ? "" : ` for ${titleOf(persona)}`}
              </span>
            </button>

            {(dashboards || []).map((d) => (
              <DashboardCard
                key={d.id}
                dashboard={d}
                personaTitle={showsAll ? titleOf(d.persona) : null}
                onOpen={() => router.push(dashboardPath(d.id))}
                onRenamed={onRenamed}
                onDeleted={onDeleted}
                onError={setError}
              />
            ))}
          </div>
        )}

        {dashboards?.length === 0 && (
          <p className="picker__empty">
            {showsAll
              ? "No dashboards yet — create one to get started."
              : `No ${titleOf(persona)} dashboards yet — create one to get started.`}
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardCard({ dashboard: d, personaTitle, onOpen, onRenamed, onDeleted, onError }) {
  const [mode, setMode] = useState(null); // null | 'rename' | 'confirmDelete'
  const [draft, setDraft] = useState(d.name);
  const [busy, setBusy] = useState(false);
  const thumb = useMemo(() => miniOption(d.preview?.echartsOption), [d.preview]);

  async function saveName() {
    const name = draft.trim();
    setMode(null);
    if (!name || name === d.name) {
      setDraft(d.name);
      return;
    }
    try {
      await api.patchDashboard(d.id, { name, nameSource: "manual" });
      onRenamed(d.id, name);
    } catch (err) {
      setDraft(d.name);
      onError(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteDashboard(d.id);
      onDeleted(d.id);
    } catch (err) {
      onError(err.message);
      setBusy(false);
      setMode(null);
    }
  }

  return (
    <div className="picker-card">
      <button type="button" className="picker-card__open" onClick={onOpen} disabled={mode !== null}>
        <span className="picker-card__thumb">
          {thumb ? (
            <ReactECharts
              option={thumb}
              style={{ height: "100%", width: "100%" }}
              opts={{ renderer: "svg" }}
              notMerge
            />
          ) : (
            <span className="picker-card__blank">
              <Icon name="grid" size={22} />
              No widgets yet
            </span>
          )}
        </span>
      </button>

      <div className="picker-card__body">
        {mode === "rename" ? (
          <input
            className="picker-card__rename"
            value={draft}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(d.name);
                setMode(null);
              }
            }}
            aria-label="Dashboard name"
          />
        ) : (
          <button type="button" className="picker-card__name" onClick={onOpen} title={d.name}>
            {d.name}
          </button>
        )}

        <div className="picker-card__meta">
          {personaTitle && <span className="picker-card__persona">{personaTitle}</span>}
          <span>
            {d.filledSlots} of {d.totalSlots} widgets
            {d.updatedAt ? ` · updated ${relativeTime(d.updatedAt)}` : ""}
          </span>
        </div>

        {mode === "confirmDelete" ? (
          <div className="picker-card__confirm">
            <span>Delete this dashboard?</span>
            <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="picker-card__actions">
            <button type="button" className="btn btn--ghost" onClick={onOpen}>
              Open <Icon name="arrowRight" size={14} />
            </button>
            <button type="button" className="picker-card__link" onClick={() => setMode("rename")}>
              Rename
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              onClick={() => setMode("confirmDelete")}
              title="Delete"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
