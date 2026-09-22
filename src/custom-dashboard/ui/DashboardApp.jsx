"use client";

import dynamic from "next/dynamic";

// Client-only: the stores read localStorage when they are created, and
// ECharts / react-grid-layout measure the DOM, so none of it can render on
// the server.
const AppShell = dynamic(() => import("./AppShell"), {
  ssr: false,
  loading: () => (
    <div className="center-page">
      <span className="spinner" />
    </div>
  ),
});

export default function DashboardApp(props) {
  return <AppShell {...props} />;
}
