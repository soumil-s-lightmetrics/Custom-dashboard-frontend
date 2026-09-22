/**
 * The rows behind a talk-to-data answer, keyed by resultId. Port of
 * backend/result_cache.py.
 *
 * This is what makes re-visualizing free: switching chart type re-reads the
 * cached rows instead of re-running the whole upstream pipeline. It is tier 1
 * of a three-tier lookup — on a miss the caller falls back to the slot's
 * stored snapshot, then to inline data — so an expired entry degrades rather
 * than breaks.
 *
 * Entries are stored through the storage layer (data/cache/results/*.json)
 * rather than in memory, so they survive a dev-server reload and so a
 * multi-instance deploy only has to swap the storage backend.
 */

import * as storage from "./storage";
import { hex } from "./util";

export const TTL_SECONDS = 2 * 60 * 60;

interface Entry {
  data: unknown;
  question: string;
  sessionId: string;
  storedAt: number; // epoch seconds
}

const ID = /^res_[0-9a-f]{16}$/;
const keyFor = (id: string) => `cache/results/${id}`;

export async function put(data: unknown, question: string, sessionId = ""): Promise<string> {
  const id = `res_${hex(16)}`;
  const entry: Entry = { data, question, sessionId, storedAt: Date.now() / 1000 };
  await storage.putBlob(keyFor(id), entry);
  return id;
}

export async function get(resultId: unknown): Promise<Entry | null> {
  if (typeof resultId !== "string" || !ID.test(resultId)) return null;
  const entry = await storage.getBlob<Entry>(keyFor(resultId));
  if (!entry) return null;
  if (Date.now() / 1000 - entry.storedAt > TTL_SECONDS) {
    await storage.deleteBlob(keyFor(resultId));
    return null;
  }
  return entry;
}

export function stats() {
  return { ttlSeconds: TTL_SECONDS, ...storage.describe() };
}
