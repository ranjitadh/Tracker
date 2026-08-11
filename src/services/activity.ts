import type { ActivityBlock } from "@/types";

// ─────────────────────────────────────────────────────────────
// Pure activity-block logic. These functions have no I/O so they
// can be unit-tested directly (see tests/activity.test.ts).
// ─────────────────────────────────────────────────────────────

export const BLOCK_MINUTES = 10;
export const BLOCK_SECONDS = BLOCK_MINUTES * 60;

export interface InputCounters {
  keyboardEvents: number;
  mouseClickEvents: number;
  mouseMoveDistance: number; // arbitrary movement units
}

export interface BlockInput {
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  counters: InputCounters;
  idleSeconds: number; // seconds in the window the user was idle
}

/**
 * Activity score from movement distance (0-100).
 * Any distance >= MOVE_FULL_SCORE counts as fully active movement.
 */
export function mouseScoreFromDistance(distance: number): number {
  const MOVE_FULL_SCORE = 4000;
  if (distance <= 0) return 0;
  if (distance >= MOVE_FULL_SCORE) return 100;
  return Math.round((distance / MOVE_FULL_SCORE) * 100);
}

/**
 * Combine keyboard/clicks/movement into a single 0-100 activity score.
 * Weighted: movement is the strongest signal, typing second, clicks third.
 */
export function combinedActivityScore(block: {
  keyboardCount: number;
  mouseClickCount: number;
  mouseActivityScore: number;
}): number {
  const keyboardPart = Math.min(block.keyboardCount / 12, 1); // 12+ keystrokes/min = full
  const clickPart = Math.min(block.mouseClickCount / 4, 1); // 4+ clicks/min = full
  const movePart = block.mouseActivityScore / 100;

  const weighted =
    keyboardPart * 0.35 + movePart * 0.5 + clickPart * 0.15;

  return Math.round(Math.min(weighted, 1) * 100);
}

/**
 * Compute an activity block from raw counters.
 * `idleSeconds` must be <= window length.
 */
export function computeActivityBlock(input: BlockInput): Omit<ActivityBlock, "id" | "sessionId" | "syncStatus"> {
  const windowSeconds = Math.max(0, Math.round((input.endedAt - input.startedAt) / 1000));
  const idle = Math.min(windowSeconds, Math.max(0, input.idleSeconds));
  const active = Math.max(0, windowSeconds - idle);

  const activityPercentage =
    windowSeconds > 0 ? Math.round((active / windowSeconds) * 100) : 0;

  const mouseScore = mouseScoreFromDistance(input.counters.mouseMoveDistance);

  return {
    startedAt: new Date(input.startedAt).toISOString(),
    endedAt: new Date(input.endedAt).toISOString(),
    keyboardCount: input.counters.keyboardEvents,
    mouseClickCount: input.counters.mouseClickEvents,
    mouseActivityScore: mouseScore,
    activeSeconds: active,
    idleSeconds: idle,
    activityPercentage,
  };
}

// ── Idle handling ────────────────────────────────────────────

export interface IdleCalcResult {
  isIdle: boolean;
  idleSeconds: number;
}

/**
 * Given the last-input timestamp and now, decide idle state.
 * Idle begins after `timeoutSeconds` with no input events.
 */
export function evaluateIdle(
  lastInputAt: number | null,
  now: number,
  timeoutSeconds: number,
): IdleCalcResult {
  if (lastInputAt === null) {
    // No events at all yet — treat as idle if the clock has been
    // running for longer than the timeout.
    return { isIdle: true, idleSeconds: 0 };
  }
  const sinceLastInput = Math.max(0, now - lastInputAt) / 1000;
  return {
    isIdle: sinceLastInput >= timeoutSeconds,
    idleSeconds: sinceLastInput,
  };
}

// ── Screenshot scheduling ────────────────────────────────────

export interface CaptureWindow {
  blockStart: number; // epoch ms
  blockEnd: number; // epoch ms
  earliestCaptureAt: number; // epoch ms
  latestCaptureAt: number; // epoch ms
}

/**
 * A "next capture window" opens after the first N minutes of a block
 * so the user always has a visible heads-up before a shot is taken.
 */
export function nextCaptureWindow(
  now: number,
  blockStart: number,
  frequencyMinutes: number,
): CaptureWindow {
  const blockEnd = blockStart + frequencyMinutes * 60_000;
  const earliest = Math.max(now, blockStart + 5 * 60_000);
  const latest = blockEnd - 10_000;
  return { blockStart, blockEnd, earliestCaptureAt: earliest, latestCaptureAt: latest };
}

export function randomCaptureTime(now: number, window: CaptureWindow): number {
  const min = Math.max(window.earliestCaptureAt, now + 30_000);
  const max = window.latestCaptureAt;
  if (max <= min) return max;
  return min + Math.floor(Math.random() * (max - min));
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
