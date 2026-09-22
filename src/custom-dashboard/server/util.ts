import { randomBytes } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Obj = Record<string, any>;

/** n lowercase hex chars — the id format the Python backend used (uuid4().hex[:n]). */
export function hex(n: number): string {
  return randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);
}

/**
 * Python's datetime.isoformat() for a UTC instant: "+00:00" rather than "Z",
 * and no fractional part when it is zero. Keeps stored timestamps in the same
 * shape the Flask backend wrote.
 */
export function isoformat(d: Date): string {
  return d.toISOString().replace(/\.000Z$/, "Z").replace(/Z$/, "+00:00");
}

export const nowIso = () => isoformat(new Date());

export function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export const clone = <T>(v: T): T => structuredClone(v);
