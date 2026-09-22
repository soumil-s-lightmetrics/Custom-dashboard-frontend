"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "./api";
import BuilderScreen from "./screens/BuilderScreen";
import DashboardPickerScreen from "./screens/DashboardPickerScreen";
import PersonaScreen from "./screens/PersonaScreen";
import { useSessionStore } from "./store/useSessionStore";
import { ROOT } from "./lib/routes";
import { track, trackError } from "./lib/track";

const Spinner = () => (
  <div className="center-page">
    <span className="spinner" />
  </div>
);

/**
 * Client root for every page (the old App.jsx): loads /api/config once, then
 * renders the screen for the route. Persona -> picker -> builder; the later
 * two send you back to the persona screen if no persona was ever chosen
 * (undefined — null means it was explicitly skipped).
 */
export default function AppShell({ screen, dashboardId }) {
  const router = useRouter();
  const { ready, hydrate, persona } = useSessionStore();
  const needsPersona = screen !== "persona" && persona === undefined;

  useEffect(() => {
    if (ready) return;
    api
      .config()
      .then(hydrate)
      .catch((err) => {
        trackError("config_failed", err);
        hydrate({});
      });
  }, [ready, hydrate]);

  useEffect(() => {
    if (needsPersona) {
      track("redirect_to_persona", { from: screen });
      router.replace(ROOT);
    }
  }, [needsPersona, router, screen]);

  useEffect(() => {
    if (ready && !needsPersona) track("screen_view", { screen, dashboardId, persona });
  }, [ready, needsPersona, screen, dashboardId, persona]);

  if (!ready || needsPersona) return <Spinner />;
  if (screen === "persona") return <PersonaScreen />;
  if (screen === "picker") return <DashboardPickerScreen />;
  return <BuilderScreen key={dashboardId} dashboardId={dashboardId} />;
}
