/**
 * Per-slot chat transcript (data/chat_history.json). Port of backend/chat_log.py.
 *
 * Upstream keeps its own history (Postgres, replayed when the slot's sessionId
 * is resent) but we cannot read it, so this is the transcript the UI redraws.
 * The thread OWNS the sessionId — it is a conversation identity, not a chart
 * property. Slot ids are unique across dashboards, so they key threads alone.
 */

import * as storage from "./storage";
import { hex, nowIso, type Obj } from "./util";

const FILE = "chat_history";
const MAX_MESSAGES_PER_THREAD = 100;
const UNASSIGNED = "unassigned";

/** Upstream drops context older than this, so the UI marks the seam. */
export const CONTEXT_TTL_MINUTES = 60;

interface Thread {
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Obj[];
}
interface Doc {
  version: number;
  threads: Record<string, Thread>;
}

const DEFAULT: Doc = { version: 1, threads: {} };

const blankThread = (): Thread => ({
  sessionId: null,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  messages: [],
});

export async function getThread(slotId?: string | null): Promise<Thread> {
  const doc = await storage.read(FILE, DEFAULT);
  return doc.threads?.[slotId || UNASSIGNED] ?? blankThread();
}

export async function getSessionId(slotId?: string | null): Promise<string | null> {
  return (await getThread(slotId)).sessionId;
}

export async function setSessionId(slotId: string | null | undefined, sessionId: string) {
  const key = slotId || UNASSIGNED;
  await storage.mutate(FILE, DEFAULT, (doc) => {
    doc.threads ??= {};
    const thread = (doc.threads[key] ??= blankThread());
    thread.sessionId = sessionId;
    thread.updatedAt = nowIso();
  });
}

/** Append turns to a thread, trimming to the cap. */
export async function append(slotId: string | null | undefined, messages: Obj[]) {
  const key = slotId || UNASSIGNED;
  await storage.mutate(FILE, DEFAULT, (doc) => {
    doc.threads ??= {};
    const thread = (doc.threads[key] ??= blankThread());
    for (const msg of messages) {
      thread.messages.push({ id: `m_${hex(12)}`, ts: nowIso(), ...msg });
    }
    if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
      thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
    }
    thread.updatedAt = nowIso();
  });
}

/**
 * Drop threads entirely. Called when a slot is cleared or removed (or its
 * dashboard deleted) — otherwise an unrelated new widget in the same slot
 * would inherit the old conversation's context.
 */
export async function clear(slotIds: string | string[]) {
  const ids = Array.isArray(slotIds) ? slotIds : [slotIds];
  if (!ids.length) return;
  await storage.mutate(FILE, DEFAULT, (doc) => {
    for (const id of ids) delete doc.threads?.[id];
  });
}

export async function lastTurnAgeMinutes(slotId?: string | null): Promise<number | null> {
  const msgs = (await getThread(slotId)).messages;
  if (!msgs.length) return null;
  const last = Date.parse(msgs[msgs.length - 1].ts);
  if (Number.isNaN(last)) return null;
  return (Date.now() - last) / 60000;
}
