import { beforeEach, describe, expect, it } from "vitest";
import {
  nextCaptureWindow,
  randomCaptureTime,
} from "@/services/activity";
import {
  enqueue,
  getQueueSnapshot,
  removePendingByEntityId,
  clearQueue,
} from "@/services/syncQueue";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  clearQueue();
});

describe("Screenshot Scheduler Randomness & Window Bounds", () => {
  it("computes a valid 10-minute block capture window", () => {
    const blockStart = NOW;
    const window = nextCaptureWindow(NOW, blockStart, 10);
    expect(window.blockEnd).toBe(blockStart + 10 * 60_000);
    expect(window.earliestCaptureAt).toBe(blockStart + 5 * 60_000);
    expect(window.latestCaptureAt).toBe(window.blockEnd - 10_000);
  });

  it("generates random capture times strictly within bounds", () => {
    const blockStart = NOW;
    const window = nextCaptureWindow(NOW, blockStart, 10);
    const times = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const t = randomCaptureTime(NOW + i, window);
      expect(t).toBeGreaterThanOrEqual(window.earliestCaptureAt);
      expect(t).toBeLessThanOrEqual(window.latestCaptureAt);
      times.add(t);
    }
    // Random distribution produces multiple unique timestamps
    expect(times.size).toBeGreaterThan(5);
  });

  it("handles late block starts gracefully without throwing", () => {
    const pastBlockStart = NOW - 12 * 60_000; // 12 minutes ago
    const window = nextCaptureWindow(NOW, pastBlockStart, 10);
    const t = randomCaptureTime(NOW, window);
    expect(t).toBeGreaterThan(0);
  });
});

describe("Screenshot Delete-Before-Sync Purge", () => {
  it("removes pending screenshot upload items when user deletes screenshot", () => {
    enqueue("screenshots", "shot-101", "create", { id: "shot-101", path: "/tmp/shot.png" });
    enqueue("activity_blocks", "block-202", "create", { id: "block-202" });

    expect(getQueueSnapshot().items).toHaveLength(2);

    // Delete screenshot
    const removed = removePendingByEntityId("screenshots", "shot-101");
    expect(removed).toBe(true);

    const snapshot = getQueueSnapshot();
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].entityId).toBe("block-202");
  });

  it("returns false if screenshot was not in pending queue", () => {
    const removed = removePendingByEntityId("screenshots", "non-existent");
    expect(removed).toBe(false);
  });
});
