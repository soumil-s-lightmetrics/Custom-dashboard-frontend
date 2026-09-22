/**
 * Resolve a natural-language question to one of the five upstream date
 * ranges. Port of backend/daterange.py.
 *
 *   1. regex — deterministic, free, instant; covers the common phrasings
 *   2. LLM   — only on a regex miss; constrained to the five values or NONE
 *   3. ask   — return null so the caller can prompt the user
 *
 * Deliberately NO silent default: a wrong default quietly changes which data
 * comes back, which is worse than asking.
 */

import { DATE_RANGES, isDateRange, settings, type DateRange } from "./config";
import { jsonCompletion, llmConfigured } from "./llm";

const [D3, D7, D14, D30, D180] = DATE_RANGES;

const PATTERNS: [RegExp, DateRange][] = [
  // --- 3 days ---
  [/\btoday\b/i, D3],
  [/\byesterday\b/i, D3],
  [/\blast\s+night\b/i, D3],
  [/\b(?:past|last|previous)\s+(?:24|48|72)\s*(?:hrs?|hours?)\b/i, D3],
  [/\b(?:past|last|previous)\s+(?:three|3)\s+days?\b/i, D3],
  // --- 7 days ---
  [/\bthis\s+week\b/i, D7],
  [/\b(?:past|last|previous)\s+week\b/i, D7],
  [/\bweekly\b/i, D7],
  [/\b(?:past|last|previous)\s+(?:seven|7)\s+days?\b/i, D7],
  // --- 14 days ---
  [/\bfortnight\b/i, D14],
  [/\bbi-?weekly\b/i, D14],
  [/\b(?:past|last|previous)\s+(?:two|2)\s+weeks?\b/i, D14],
  [/\b(?:past|last|previous)\s+(?:fourteen|14)\s+days?\b/i, D14],
  // --- 30 days ---
  [/\bthis\s+month\b/i, D30],
  [/\b(?:past|last|previous)\s+month\b/i, D30],
  [/\bmonthly\b/i, D30],
  [/\bmtd\b/i, D30],
  [/\b(?:past|last|previous)\s+(?:thirty|30)\s+days?\b/i, D30],
  [/\b(?:past|last|previous)\s+(?:four|4)\s+weeks?\b/i, D30],
  // --- 180 days ---
  [/\b(?:this|last|past|previous)\s+quarter\b/i, D180],
  [/\bytd\b/i, D180],
  [/\byear\s+to\s+date\b/i, D180],
  [/\bhalf[-\s]?year\b/i, D180],
  [/\b(?:past|last|previous)\s+(?:six|6)\s+months?\b/i, D180],
  [/\b(?:past|last|previous)\s+\d+\s+months?\b/i, D180],
];

// Bare "last N days" — routed by magnitude so novel numbers still resolve.
const N_DAYS = /\b(?:past|last|previous|over\s+the\s+last)\s+(\d{1,4})\s*(?:days?|d)\b/i;

function bucketForDays(n: number): DateRange {
  if (n <= 3) return D3;
  if (n <= 7) return D7;
  if (n <= 14) return D14;
  if (n <= 30) return D30;
  return D180;
}

/** Stage 1. A canonical range, or null if nothing matched. */
export function resolveByRegex(question: string): DateRange | null {
  if (!question) return null;
  const q = question.toLowerCase();
  const m = N_DAYS.exec(q);
  if (m) return bucketForDays(Number.parseInt(m[1], 10));
  for (const [pattern, value] of PATTERNS) {
    if (pattern.test(q)) return value;
  }
  return null;
}

const LLM_SYSTEM = `You map a user's question to exactly one reporting time window.

Allowed outputs (choose the single closest one):
${DATE_RANGES.map((r) => "  - " + r).join("\n")}
  - NONE

Rules:
- Return NONE if the question contains no time reference at all. Do NOT guess.
- Never invent a window that is not in the list.
- Pick the nearest listed window when the phrase is between two of them.

Respond with JSON only: {"range": "<one of the values above>"}`;

/** Stage 2. Only called on a regex miss. Null when the model says NONE. */
async function resolveByLlm(question: string): Promise<DateRange | null> {
  if (!llmConfigured()) {
    console.warn("[daterange] no CD_OPENAI_API_KEY — skipping LLM date-range fallback");
    return null;
  }
  try {
    const raw = JSON.parse(
      await jsonCompletion({ model: settings.utilityModel, system: LLM_SYSTEM, user: question, temperature: 0 }),
    );
    const value = String(raw.range ?? "").trim();
    return isDateRange(value) ? value : null;
  } catch (err) {
    console.warn(`[daterange] LLM fallback failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Full three-stage resolution: [range, source] where source is
 * "regex" | "llm" | "none". "none" means ask the user — do NOT default.
 */
export async function resolve(question: string): Promise<[DateRange | null, string]> {
  const hit = resolveByRegex(question);
  if (hit) return [hit, "regex"];
  const llm = await resolveByLlm(question);
  if (llm) return [llm, "llm"];
  return [null, "none"];
}
