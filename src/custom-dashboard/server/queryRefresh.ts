/**
 * Re-anchor the absolute dates in a stored question to the present.
 * Port of backend/query_refresh.py.
 *
 * A saved report replays its ORIGINAL question. Relative phrasing ("last 30
 * days") re-resolves on its own and is left alone. Absolute dates do not — and
 * a replayed August window sits entirely outside the relative "Past 30 days"
 * bucket sent alongside it, so the result comes back EMPTY.
 *
 * Every absolute date is shifted forward by the time elapsed since the
 * question was first asked, at the precision it was written in (days, whole
 * months, whole quarters), which preserves the window's LENGTH.
 *
 * Deliberately NOT rewritten: relative phrases, a bare year, and anything when
 * less than a day has passed or nothing matched.
 */

import { isObj, isoformat, type Obj } from "./util";

/* ----------------------------------------------------- calendar helpers */

interface Day {
  y: number;
  m: number; // 1-12
  d: number;
}

const DAY_MS = 86_400_000;

function toMs({ y, m, d }: Day): number {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return dt.getTime();
}

function fromMs(ms: number): Day {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const daysInMonth = (y: number, m: number) => fromMs(toMs({ y, m: m + 1, d: 1 }) - DAY_MS).d;

/** Python's date(): throws on anything outside the calendar. */
function makeDate(y: number, m: number, d: number): Day {
  if (!(y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m))) {
    throw new RangeError(`invalid date ${y}-${m}-${d}`);
  }
  return { y, m, d };
}

/** A day-of-month that does not exist after a shift (Jan 31 -> Feb) clamps. */
function clampDate(y: number, m: number, d: number): Day {
  if (m < 1 || m > 12) throw new RangeError(`invalid month ${m}`);
  return makeDate(y, m, Math.min(d, daysInMonth(y, m)));
}

function addDays(day: Day, n: number): Day {
  const out = fromMs(toMs(day) + n * DAY_MS);
  if (out.y < 1 || out.y > 9999) throw new RangeError("date out of range");
  return out;
}

function shiftMonths(day: Day, months: number): Day {
  const total = day.y * 12 + day.m - 1 + months;
  return clampDate(Math.floor(total / 12), (((total % 12) + 12) % 12) + 1, day.d);
}

const monthsBetween = (a: Day, b: Day) => (b.y - a.y) * 12 + (b.m - a.m);
const daysBetween = (a: Day, b: Day) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

/** Pick the year that puts a year-less date nearest the anchor. */
function inferYear(month: number, day: number, anchor: Day): number {
  let best = anchor.y - 1;
  let bestGap = Infinity;
  for (const y of [anchor.y - 1, anchor.y, anchor.y + 1]) {
    const gap = Math.abs(daysBetween(anchor, clampDate(y, month, day)));
    if (gap < bestGap) {
      best = y;
      bestGap = gap;
    }
  }
  return best;
}

/* ------------------------------------------------------ month vocabulary */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBR = MONTH_NAMES.map((n) => n.slice(0, 3));

const FULL: Record<string, number> = Object.fromEntries(MONTH_NAMES.map((n, i) => [n.toLowerCase(), i + 1]));
const ABBR: Record<string, number> = Object.fromEntries(MONTH_ABBR.map((n, i) => [n.toLowerCase(), i + 1]));
const MONTHS: Record<string, number> = { ...FULL, ...ABBR, sept: 9 };

// Longest-first so "march" is never matched as "mar".
const MONTH_RE = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const bare = (token: string) => token.replace(/\.+$/, "").toLowerCase();
const isUpper = (s: string) => s !== s.toLowerCase() && s === s.toUpperCase();
const isLower = (s: string) => s !== s.toUpperCase() && s === s.toLowerCase();

/** Re-render a month number in the same style as the token it replaces. */
function renderMonth(month: number, like: string): string {
  const b = bare(like);
  const abbreviated = b in ABBR && !(b in FULL);
  const text = abbreviated ? MONTH_ABBR[month - 1] : MONTH_NAMES[month - 1];
  if (isUpper(like)) return text.toUpperCase();
  if (isLower(like)) return text.toLowerCase();
  return text;
}

/* -------------------------------------------------------------- patterns */
//
// Order matters. Day-precision patterns run first; their trailing
// (?!\s*\d) stops "August 2026" being read as the 20th of August.

const ORD = "(?:st|nd|rd|th)?";
const ISO = /\b(\d{4})([-/])(\d{1,2})\2(\d{1,2})\b/g;
const D_MON_Y = new RegExp(
  `\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:\\s*,?\\s*(\\d{4}))?(?!\\s*\\d)\\b`,
  "gi",
);
const MON_D_Y = new RegExp(
  `\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})${ORD}(?:\\s*,?\\s*(\\d{4}))?(?!\\s*\\d)\\b`,
  "gi",
);
const MON_Y = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{4})\\b`, "gi");
const QUARTER = /\bQ([1-4])\s*(?:of\s+)?(\d{4})\b/gi;

type Render = (m: RegExpMatchArray, anchor: Day, days: number, months: number) => string | null;

const pad = (n: number, w: number) => String(n).padStart(w, "0");

const subIso: Render = (m, _anchor, days) => {
  let start: Day;
  try {
    start = makeDate(+m[1], +m[3], +m[4]);
  } catch {
    return null;
  }
  const s = addDays(start, days);
  const sep = m[2];
  // Keep the separator; always zero-pad.
  return `${pad(s.y, 4)}${sep}${pad(s.m, 2)}${sep}${pad(s.d, 2)}`;
};

const subDMonY: Render = (m, anchor, days) => {
  const day = +m[1];
  const token = m[2];
  const year = m[3];
  const month = MONTHS[bare(token)];
  if (!month) return null;
  const y = year ? +year : inferYear(month, day, anchor);
  let s: Day;
  try {
    s = addDays(clampDate(y, month, day), days);
  } catch {
    return null;
  }
  const out = `${s.d} ${renderMonth(s.m, token)}`;
  return year ? `${out} ${s.y}` : out;
};

const subMonDY: Render = (m, anchor, days) => {
  const token = m[1];
  const day = +m[2];
  const year = m[3];
  const month = MONTHS[bare(token)];
  if (!month) return null;
  const y = year ? +year : inferYear(month, day, anchor);
  let s: Day;
  try {
    s = addDays(clampDate(y, month, day), days);
  } catch {
    return null;
  }
  const out = `${renderMonth(s.m, token)} ${s.d}`;
  return year ? `${out}, ${s.y}` : out;
};

const subMonY: Render = (m, _anchor, _days, months) => {
  const token = m[1];
  const month = MONTHS[bare(token)];
  if (!month) return null;
  const s = shiftMonths(makeDate(+m[2], month, 1), months);
  return `${renderMonth(s.m, token)} ${s.y}`;
};

const subQuarter: Render = (m, _anchor, _days, months) => {
  const q = +m[1];
  // Quarters move in whole quarters, so a Q3 report stays a quarter wide.
  const s = shiftMonths(makeDate(+m[2], (q - 1) * 3 + 1, 1), Math.floor(months / 3) * 3);
  return `Q${Math.floor((s.m - 1) / 3) + 1} ${s.y}`;
};

const RULES: [RegExp, Render][] = [
  [ISO, subIso],
  [D_MON_Y, subDMonY],
  [MON_D_Y, subMonDY],
  [MON_Y, subMonY],
  [QUARTER, subQuarter],
];

/* ------------------------------------------------------------ public API */

const ISO_TS = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * The calendar date of a stored ISO timestamp, in its own offset (as Python's
 * datetime.fromisoformat(...).date() gives). Null on anything unusable.
 */
export function parseIsoDate(value: unknown): Day | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = ISO_TS.exec(value.trim());
  if (!m) return null;
  try {
    const day = makeDate(+m[1], +m[2], +m[3]);
    if (m[4] !== undefined && (+m[4] > 23 || +m[5] > 59 || +(m[6] ?? 0) > 59)) return null;
    return day;
  } catch {
    return null;
  }
}

export interface RetimeResult {
  question: string;
  changed: boolean;
  shiftedDays: number;
  replacements: { from: string; to: string }[];
}

/** Shift absolute dates in `question` forward by the time since `anchor`. */
export function retime(question: string, anchor: unknown, now: Date = new Date()): RetimeResult {
  const start = parseIsoDate(anchor);
  if (!question || !start) return { question, changed: false, shiftedDays: 0, replacements: [] };

  const today: Day = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
  const days = daysBetween(start, today);
  if (days < 1) return { question, changed: false, shiftedDays: 0, replacements: [] };

  const months = monthsBetween(start, today);
  const replacements: { from: string; to: string }[] = [];
  // Spans an earlier rule already claimed, so a date is never shifted twice.
  const taken: [number, number][] = [];
  const edits: [number, number, string][] = [];

  for (const [pattern, render] of RULES) {
    for (const m of question.matchAll(pattern)) {
      const s = m.index!;
      const e = s + m[0].length;
      if (taken.some(([ts, te]) => !(e <= ts || s >= te))) continue;
      let replacement: string | null;
      try {
        replacement = render(m, start, days, months);
      } catch (err) {
        console.warn(`[queryRefresh] could not re-time ${JSON.stringify(m[0])}: ${(err as Error).message}`);
        continue;
      }
      if (!replacement || replacement === m[0]) continue;
      taken.push([s, e]);
      edits.push([s, e, replacement]);
      replacements.push({ from: m[0], to: replacement });
    }
  }

  if (!edits.length) return { question, changed: false, shiftedDays: days, replacements: [] };

  let out = question;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0] || b[1] - a[1])) {
    out = out.slice(0, s) + r + out.slice(e);
  }
  return { question: out, changed: true, shiftedDays: days, replacements };
}

/**
 * Re-anchor a stored query object. Returns [query, change record or null].
 * `askedAt` advances to now whenever the question is rewritten, so calling
 * this twice cannot shift the same dates twice.
 */
export function retimeQuery<Q>(query: Q, now: Date = new Date()): [Q, Obj | null] {
  if (!isObj(query)) return [query, null];
  const question = query.question;
  if (typeof question !== "string" || !question.trim()) return [query, null];

  const copy: Obj = { ...query };
  const result = retime(question, copy.askedAt, now);
  if (!result.changed) return [copy as Q, null];

  const record = {
    originalQuestion: question,
    shiftedDays: result.shiftedDays,
    replacements: result.replacements,
    retimedAt: isoformat(now),
  };
  copy.question = result.question;
  copy.askedAt = isoformat(now);
  copy.retimed = record;
  console.info(`[queryRefresh] re-anchored saved question by ${result.shiftedDays} days`);
  return [copy as Q, record];
}
