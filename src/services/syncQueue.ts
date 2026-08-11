import { v4 as uuidv4 } from "uuid";
import type { SyncQueueItem, SyncState } from "@/types";

// ─────────────────────────────────────────────────────────────
// Durable offline sync queue.
//
// Items persist to localStorage so a crash / restart never loses
// them. Flushing uses exponential backoff with jitter and marks
// items in_flight before attempting so a concurrent process can't
// double-send. Unit-tested in tests/syncQueue.test.ts.
// ─────────────────────────────────────────────────────────────

const QUEUE_KEY = "time-tracker.sync.queue";
const STATE_KEY = "time-tracker.sync.state";

export const INITIAL_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

export interface QueueSnapshot {
  items: SyncQueueItem[];
  state: SyncState;
}

function load(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: SyncQueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function loadState(): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as SyncState;
  } catch {
    // fall through
  }
  return {
    connected: false,
    mode: "offline",
    lastSyncAt: null,
    queueLength: 0,
    pendingCount: 0,
    failedCount: 0,
    syncing: false,
    backendUrl: null,
    usingMock: true,
  };
}

function saveState(state: SyncState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function enqueue(
  entityType: string,
  entityId: string,
  operation: SyncQueueItem["operation"],
  payload: unknown,
): SyncQueueItem {
  const item: SyncQueueItem = {
    id: uuidv4(),
    entityType,
    entityId,
    operation,
    payload,
    status: "pending",
    attempts: 0,
    nextRetryAt: 0,
    lastError: null,
    createdAt: Date.now(),
  };
  const items = load();
  items.push(item);
  save(items);
  return item;
}

export function enqueueReplaceIfPending(
  entityType: string,
  entityId: string,
  operation: SyncQueueItem["operation"],
  payload: unknown,
): SyncQueueItem {
  const items = load();
  const existing = items.find(
    (i) =>
      i.entityType === entityType &&
      i.entityId === entityId &&
      i.status === "pending",
  );
  if (existing) {
    existing.payload = payload;
    existing.operation = operation;
    save(items);
    return existing;
  }
  return enqueue(entityType, entityId, operation, payload);
}

export function removePendingByEntityId(entityType: string, entityId: string): boolean {
  const items = load();
  const filtered = items.filter(
    (i) => !(i.entityType === entityType && i.entityId === entityId),
  );
  if (filtered.length !== items.length) {
    save(filtered);
    updateCounts();
    return true;
  }
  return false;
}

function dueItems(items: SyncQueueItem[], now: number): SyncQueueItem[] {
  return items.filter(
    (i) => (i.status === "pending" || i.status === "failed") && i.nextRetryAt <= now,
  );
}

function backoffDelay(attempts: number): number {
  const cap = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(cap * jitter);
}

export type FlushFn = (item: SyncQueueItem) => Promise<void>;

/**
 * Attempt to flush all due items. Returns the number successfully
 * flushed. On failure items are marked failed with exponential
 * backoff for `nextRetryAt`.
 */
export async function flushQueue(flush: FlushFn, options?: { onProgress?: (done: number, total: number) => void }): Promise<number> {
  let items = load();
  const due = dueItems(items, Date.now());
  if (due.length === 0) return 0;

  updateState({ syncing: true });
  let flushed = 0;
  const total = due.length;

  for (const item of due) {
    // Re-load each iteration in case a concurrent flush mutated it.
    items = load();
    const current = items.find((i) => i.id === item.id);
    if (!current || (current.status !== "pending" && current.status !== "failed")) {
      continue;
    }
    if (current.nextRetryAt > Date.now()) continue;

    current.status = "in_flight";
    save(items);

    try {
      await flush(current);
      items = load();
      const idx = items.findIndex((i) => i.id === item.id);
      if (idx !== -1) items.splice(idx, 1);
      save(items);
      flushed += 1;
      options?.onProgress?.(flushed, total);
    } catch (err) {
      items = load();
      const idx = items.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        const retryItem = items[idx];
        retryItem.attempts += 1;
        retryItem.status = "failed";
        retryItem.lastError = err instanceof Error ? err.message : String(err);
        retryItem.nextRetryAt = Date.now() + backoffDelay(retryItem.attempts);
        save(items);
      }
    }
  }

  updateState({ syncing: false });
  updateCounts();
  return flushed;
}

export function getQueueSnapshot(): QueueSnapshot {
  const items = load();
  updateCounts();
  const state = loadState();
  return { items, state };
}

function updateCounts() {
  const items = load();
  updateState({
    queueLength: items.length,
    pendingCount: items.filter((i) => i.status === "pending" || i.status === "in_flight").length,
    failedCount: items.filter((i) => i.status === "failed").length,
  });
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
  updateCounts();
}

export function getSyncState(): SyncState {
  updateCounts();
  return loadState();
}

export function updateState(patch: Partial<SyncState>) {
  const next = { ...loadState(), ...patch };
  saveState(next);
}

// ── localStorage-backed "durable" wrapper ────────────────────
// Kept tiny so tests can substitute an in-memory store later.

export const queueStorage = {
  load,
  save,
};

// Re-exported for tests that need deterministic backoff.
export { backoffDelay };
