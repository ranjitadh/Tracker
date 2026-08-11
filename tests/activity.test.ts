import { describe, expect, it } from "vitest";
import {
  BLOCK_SECONDS,
  computeActivityBlock,
  mouseScoreFromDistance,
  combinedActivityScore,
  evaluateIdle,
  nextCaptureWindow,
  randomCaptureTime,
  formatCountdown,
} from "@/services/activity";

const T = 1_700_000_000_000;

describe("mouseScoreFromDistance", () => {
  it("scales distance to 0-100 with a ceiling", () => {
    expect(mouseScoreFromDistance(0)).toBe(0);
    expect(mouseScoreFromDistance(2000)).toBe(50);
    expect(mouseScoreFromDistance(4000)).toBe(100);
    expect(mouseScoreFromDistance(9000)).toBe(100);
  });
});

describe("computeActivityBlock", () => {
  it("produces a full-active block with no idle", () => {
    const block = computeActivityBlock({
      startedAt: T,
      endedAt: T + BLOCK_SECONDS * 1000,
      counters: { keyboardEvents: 42, mouseClickEvents: 8, mouseMoveDistance: 6200 },
      idleSeconds: 0,
    });
    expect(block.activeSeconds).toBe(BLOCK_SECONDS);
    expect(block.idleSeconds).toBe(0);
    expect(block.activityPercentage).toBe(100);
    expect(block.mouseActivityScore).toBe(100);
    expect(block.keyboardCount).toBe(42);
  });

  it("splits time when idle is reported", () => {
    const block = computeActivityBlock({
      startedAt: T,
      endedAt: T + BLOCK_SECONDS * 1000,
      counters: { keyboardEvents: 5, mouseClickEvents: 1, mouseMoveDistance: 100 },
      idleSeconds: 240,
    });
    expect(block.activeSeconds).toBe(BLOCK_SECONDS - 240);
    expect(block.idleSeconds).toBe(240);
  });

  it("caps idle at the window length", () => {
    const block = computeActivityBlock({
      startedAt: T,
      endedAt: T + BLOCK_SECONDS * 1000,
      counters: { keyboardEvents: 0, mouseClickEvents: 0, mouseMoveDistance: 0 },
      idleSeconds: 9999,
    });
    expect(block.idleSeconds).toBe(BLOCK_SECONDS);
    expect(block.activeSeconds).toBe(0);
  });
});

describe("combinedActivityScore", () => {
  it("weights movement, typing and clicks", () => {
    expect(combinedActivityScore({ keyboardCount: 120, mouseClickCount: 40, mouseActivityScore: 100 })).toBe(100);
    expect(combinedActivityScore({ keyboardCount: 0, mouseClickCount: 0, mouseActivityScore: 0 })).toBe(0);
    const partial = combinedActivityScore({ keyboardCount: 12, mouseClickCount: 4, mouseActivityScore: 50 });
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(100);
  });
});

describe("evaluateIdle", () => {
  it("treats unknown input as idle", () => {
    expect(evaluateIdle(null, T, 300).isIdle).toBe(true);
  });

  it("respects the timeout", () => {
    expect(evaluateIdle(T - 10_000, T, 300).isIdle).toBe(false);
    expect(evaluateIdle(T - 400_000, T, 300).isIdle).toBe(true);
  });
});

describe("screenshot scheduling", () => {
  it("opens a capture window after the heads-up period", () => {
    const blockStart = T;
    const window = nextCaptureWindow(T, blockStart, 10);
    expect(window.blockEnd).toBe(blockStart + 10 * 60_000);
    expect(window.earliestCaptureAt).toBe(blockStart + 5 * 60_000);
    expect(window.latestCaptureAt).toBeLessThanOrEqual(window.blockEnd);
  });

  it("random capture time stays inside the window", () => {
    const blockStart = T;
    const window = nextCaptureWindow(T, blockStart, 10);
    for (let i = 0; i < 50; i++) {
      const t = randomCaptureTime(T, window);
      expect(t).toBeGreaterThanOrEqual(window.earliestCaptureAt);
      expect(t).toBeLessThanOrEqual(window.latestCaptureAt);
    }
  });
});

describe("formatCountdown", () => {
  it("formats mm:ss", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(90_000)).toBe("01:30");
    expect(formatCountdown(-1000)).toBe("00:00");
  });
});
