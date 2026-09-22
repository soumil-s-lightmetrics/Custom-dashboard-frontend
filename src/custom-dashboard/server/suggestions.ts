/**
 * Persona-specific starter questions. Port of backend/suggestions.py.
 *
 * Cache -> LLM -> seeds. Never throws; a failure degrades to seeds.
 * `source` tells the UI which it is looking at.
 */

import { settings } from "./config";
import { jsonCompletion, llmConfigured } from "./llm";
import { DOMAIN_DESCRIPTIONS, getPersona } from "./personas";
import * as storage from "./storage";
import { hex, nowIso, type Obj } from "./util";

const FILE = "suggestion_cache";
const PROMPT_VERSION = 1;
const DEFAULT = { version: 1, promptVersion: PROMPT_VERSION, entries: {} as Record<string, Obj> };

interface Suggestion {
  id: string;
  text: string;
  domainHint: string;
}

const wrap = (texts: string[], domainHint: string): Suggestion[] =>
  texts.map((text) => ({ id: `sug_${hex(8)}`, text, domainHint }));

function seeds(personaId: string, n = 3): Suggestion[] {
  const p = getPersona(personaId);
  return wrap(p.seeds.slice(0, n), p.domains[0]);
}

async function cached(personaId: string): Promise<Obj | null> {
  const doc = await storage.read(FILE, DEFAULT);
  if (doc.promptVersion !== PROMPT_VERSION) return null;
  const entry = doc.entries?.[personaId];
  if (!entry) return null;
  const generated = Date.parse(entry.generatedAt);
  if (Number.isNaN(generated)) return null;
  const ageDays = Math.floor((Date.now() - generated) / 86_400_000);
  return ageDays > settings.suggestionTtlDays ? null : entry;
}

async function store(personaId: string, items: Suggestion[]) {
  await storage.mutate(FILE, DEFAULT, (doc) => {
    doc.promptVersion = PROMPT_VERSION;
    doc.entries ??= {};
    doc.entries[personaId] = { generatedAt: nowIso(), model: settings.utilityModel, suggestions: items };
  });
}

async function generate(personaId: string, n: number): Promise<Suggestion[]> {
  const persona = getPersona(personaId);
  const domains = persona.domains;
  const described = domains.map((d) => `- ${d}: ${DOMAIN_DESCRIPTIONS[d] ?? ""}`).join("\n");

  const system = `You write starter questions for a fleet-telematics dashboard.

The user's role is "${persona.title}" — ${persona.description}.

They can only ask about data described here:
${described}

Write exactly ${n} questions that this role would want as dashboard widgets.

Hard rules:
- Each must be answerable by ONE query over the data described above.
- Under 12 words each.
- Include a time window using EXACTLY one of these phrasings:
  "this week", "last 7 days", "last 14 days", "last 30 days", "last 30 days".
- Never invent column or table names.
- Make the set varied: one ranking/top-N question, one trend-over-time
  question, and one list question.
- Plain requests, no question marks needed.

Respond as JSON: {"suggestions": [{"text": "...", "domainHint": "<domain>"}]}
where domainHint is one of: ${domains.join(", ")}`;

  const raw = JSON.parse(
    await jsonCompletion({
      model: settings.utilityModel,
      system,
      user: `Write ${n} starter questions.`,
      temperature: 0.7,
    }),
  );

  const out: Suggestion[] = [];
  for (const item of raw.suggestions ?? []) {
    const text = String(item?.text ?? "").trim();
    if (!text) continue;
    const hint = item.domainHint in DOMAIN_DESCRIPTIONS ? item.domainHint : domains[0];
    out.push({ id: `sug_${hex(8)}`, text, domainHint: hint });
  }
  return out.slice(0, n);
}

export async function getSuggestions(personaId: string, n = 3, refresh = false) {
  if (!refresh) {
    const entry = await cached(personaId);
    if (entry?.suggestions?.length) {
      return {
        personaId,
        source: "cache",
        generatedAt: entry.generatedAt,
        suggestions: entry.suggestions.slice(0, n),
      };
    }
  }

  if (llmConfigured()) {
    try {
      let items = await generate(personaId, n);
      if (items.length) {
        // Top up from seeds if the model returned too few.
        if (items.length < n) items = items.concat(seeds(personaId, n - items.length));
        await store(personaId, items);
        return { personaId, source: "llm", generatedAt: nowIso(), suggestions: items.slice(0, n) };
      }
    } catch (err) {
      console.warn(`[suggestions] generation failed for ${personaId}: ${(err as Error).message}`);
    }
  }

  return { personaId, source: "seed", generatedAt: null, suggestions: seeds(personaId, n) };
}
