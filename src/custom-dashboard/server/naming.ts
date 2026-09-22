/**
 * Widget and dashboard names. Port of backend/naming.py.
 *
 * Upstream's /generate-report-name needs the SQL (never received here) and a
 * live in-process session, so widgets are named from the question plus a
 * profile of the returned rows.
 */

import { settings } from "./config";
import * as databind from "./databind";
import { jsonCompletion, llmConfigured } from "./llm";
import type { Obj } from "./util";

const MAX_SAMPLE_ROWS = 20;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 300;

function fallbackName(question: string): string {
  const q = (question || "Untitled widget").trim();
  return q.slice(0, 60);
}

const WIDGET_SYSTEM = `You name dashboard widgets.

Given the question a user asked and a profile of the data that came back,
produce a short title and a one-sentence description.

The title has to tell this widget apart from a dozen others sitting next to it
on the same dashboard, so the SCOPE the user asked for is part of what the
widget shows:

- If the question names a specific subject — a driver, vehicle, fleet, site,
  route — that name MUST appear in reportName, and MUST come first. Titles are
  truncated from the right in a narrow header, so the subject has to survive
  the cut. "Safety Events By Category" and "Daniel Taylor - Safety Events By
  Category" are different widgets and must not get the same name.
- If the question states a time window ("last 30 days", "this week"), put it
  last, and only if the name is still under the limit without it being cramped.
- Beyond that, name what the widget SHOWS rather than echoing the user's
  phrasing verbatim.

Rules:
- reportName: at most 100 characters, title case, no trailing punctuation.
- reportDescription: one sentence, at most 300 characters. Name the subject
  and the time window here too.
- A fact stated in the QUESTION is a known fact — use it, even when no column
  carries it (a per-driver query is usually already filtered to that driver, so
  the driver's name will not appear in the rows). Invent nothing that is in
  neither the question nor the columns.

EXAMPLE
QUESTION: show events for Daniel Taylor in the last 30 days by each category of safety events
COLUMNS: event_category, event_count
{"reportName": "Daniel Taylor - Safety Events By Category, Last 30 Days",
 "reportDescription": "Count of safety events recorded for driver Daniel Taylor over the last 30 days, broken down by event category."}

Respond as JSON: {"reportName": "...", "reportDescription": "..."}`;

/** {reportName, reportDescription, fallback}. Never throws. */
export async function widgetName(question: string, rows: Obj[]) {
  const fallback = { reportName: fallbackName(question), reportDescription: "", fallback: true };
  if (!llmConfigured() || !rows.length) return fallback;

  const prof = databind.profile(rows);
  const user = `QUESTION: ${question}

ROW COUNT: ${prof.rowCount}

COLUMNS:
${JSON.stringify(prof.columns, null, 2)}

SAMPLE ROWS:
${JSON.stringify(rows.slice(0, MAX_SAMPLE_ROWS), null, 2)}`;

  try {
    const raw = JSON.parse(
      await jsonCompletion({ model: settings.utilityModel, system: WIDGET_SYSTEM, user, temperature: 0.4 }),
    );
    const name = String(raw.reportName ?? "").trim().slice(0, NAME_MAX);
    const desc = String(raw.reportDescription ?? "").trim().slice(0, DESCRIPTION_MAX);
    if (!name) throw new Error("empty reportName");
    return { reportName: name, reportDescription: desc, fallback: false };
  } catch (err) {
    console.warn(`[naming] widget naming failed: ${(err as Error).message}`);
    return fallback;
  }
}

const DASHBOARD_SYSTEM = `You name dashboards.

Given a user's role and the widgets on their dashboard, propose 3 short names.

Rules:
- 2 to 4 words each. Title case. No punctuation.
- Name the dashboard's PURPOSE, not the list of widgets.
- Make the three meaningfully different from each other.

Respond as JSON: {"names": ["...", "...", "..."]}`;

/** Three candidate dashboard names. Falls back to "<Persona> Dashboard". */
export async function dashboardNames(personaTitle: string, widgetTitles: string[]): Promise<string[]> {
  const fallback = [`${personaTitle} Dashboard`];
  if (!llmConfigured()) return fallback;

  const listed = widgetTitles.filter(Boolean).map((t) => `- ${t}`).join("\n") || "- (no widgets yet)";
  try {
    const raw = JSON.parse(
      await jsonCompletion({
        model: settings.utilityModel,
        system: DASHBOARD_SYSTEM,
        user: `ROLE: ${personaTitle}\n\nWIDGETS:\n${listed}`,
        temperature: 0.8,
      }),
    );
    const names = (Array.isArray(raw.names) ? raw.names : [])
      .map((n: unknown) => String(n ?? "").trim())
      .filter(Boolean);
    return names.length ? names.slice(0, 3) : fallback;
  } catch (err) {
    console.warn(`[naming] dashboard naming failed: ${(err as Error).message}`);
    return fallback;
  }
}
