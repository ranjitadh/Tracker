import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueue,
  enqueueReplaceIfPending,
  flushQueue,
  getQueueSnapshot,
  clearQueue,
  backoffDelay,
} from "@/services/syncQueue";

beforeEach(() => {
  localStorage.clear();
});

describe("enqueue", () => {
  it("persists an item to localStorage", () => {
    enqueue("activity_blocks", "b-1", "create", { id: "b-1" });
    const snap = getQueueSnapshot();
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0].entityType).toBe("activity_blocks");
    expect(snap.items[0].status).toBe("pending");
    expect(snap.state.pendingCount).toBe(1);
  });
});

describe("enqueueReplaceIfPending", () => {
  it("replaces a pending item with the same entity", () => {
    enqueue("tracking_sessions", "s-1", "create", { v: 1 });
    enqueueReplaceIfPending("tracking_sessions", "s-1", "update", { v: 2 });
    const snap = getQueueSnapshot();
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0].operation).toBe("update");
    expect(snap.items[0].payload).toEqual({ v: 2 });
  });

  it("appends when nothing is pending for the entity", () => {
    enqueue("screenshots", "x", "create", { id: "x" });
    enqueueReplaceIfPending("screenshots", "y", "create", { id: "y" });
    expect(getQueueSnapshot().items).toHaveLength(2);
  });
});

describe("flushQueue", () => {
  it("flushes due items and removes them", async () => {
    enqueue("activity_blocks", "b-1", "create", { id: "b-1" });
    enqueue("activity_blocks", "b-2", "create", { id: "b-2" });
    const flushed = await flushQueue(async () => {});
    expect(flushed).toBe(2);
    expect(getQueueSnapshot().items).toHaveLength(0);
  });

  it("marks failed items with backoff and keeps them", async () => {
    enqueue("screenshots", "ss-1", "create", { id: "ss-1" });
    const flush = vi.fn(async () => {
      throw new Error("network down");
    });
    const flushed = await flushQueue(flush);
    expect(flushed).toBe(0);
    const snap = getQueueSnapshot();
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0].status).toBe("failed");
    expect(snap.items[0].attempts).toBe(1);
    expect(snap.items[0].nextRetryAt).toBeGreaterThan(Date.now());
    expect(snap.state.failedCount).toBe(1);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially and stays capped", () => {
    const first = backoffDelay(1);
    const second = backoffDelay(2);
    expect(second).toBeGreaterThanOrEqual(first);
    expect(backoffDelay(20)).toBeLessThanOrEqual(5 * 60_000 * 1.25);
  });
});

describe("clearQueue", () => {
  it("empties the queue", () => {
    enqueue("manual_time_entries", "m-1", "create", {});
    clearQueue();
    expect(getQueueSnapshot().items).toHaveLength(0);
  });
});
