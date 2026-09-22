/**
 * Per-persona "Suggested Reports" — three curated reports per persona.
 * Port of backend/suggested_reports.py.
 *
 * Served from data/suggested_reports.json so the catalog can be edited in
 * place; the shipped catalog (catalog/suggested_reports.json, exported
 * verbatim from the Python CATALOG) is the fallback when that is missing or
 * empty.
 *
 * `chart.echartsOption` is a rail thumbnail only — running a card sends the
 * assembled question through the ordinary ask -> visualize path.
 */

import CATALOG_JSON from "./catalog/suggested_reports.json";
import * as storage from "./storage";
import { clone, type Obj } from "./util";

const FILE = "suggested_reports";
export const CATALOG: Obj[] = CATALOG_JSON as Obj[];

const PLACEHOLDER = /\{(\w+)\}/g;

async function all(): Promise<Obj[]> {
  const doc = await storage.read(FILE, { version: 1, reports: [] as Obj[] });
  return doc.reports?.length ? doc.reports : CATALOG;
}

export async function listAll() {
  return clone(await all());
}

/** The three reports for a persona. Unknown/null resolves to generalist. */
export async function forPersona(personaId?: string | null): Promise<Obj[]> {
  const reports = await all();
  const wanted = personaId || "generalist";
  let hits = reports.filter((r) => r.personaId === wanted);
  if (!hits.length) hits = reports.filter((r) => r.personaId === "generalist");
  return clone(hits);
}

export async function get(reportId: string): Promise<Obj | null> {
  const hit = (await all()).find((r) => r.id === reportId);
  return hit ? clone(hit) : null;
}

/** The {names} used by a template, in order of first appearance. */
export function placeholders(template: string): string[] {
  const seen: string[] = [];
  for (const m of (template || "").matchAll(PLACEHOLDER)) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

/** Substitute answers into a report's questionTemplate; blanks keep the placeholder. */
export function assembleQuestion(report: Obj, values: Record<string, string>): string {
  const template: string = report.query?.questionTemplate || "";
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const v = values?.[key];
    return v && String(v).trim() ? String(v).trim() : whole;
  });
}
