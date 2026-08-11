import type { TrackingSession } from "@/types";

// ─────────────────────────────────────────────────────────────
// Session/timer logic shared between mock and real modes.
// Pure and unit-testable (tests/timer.test.ts).
// ─────────────────────────────────────────────────────────────

export function elapsedSeconds(session: TrackingSession, now: number): number {
  const started = new Date(session.startedAt).getTime();
  const base = Math.max(0, (now - started) / 1000);
  return Math.max(0, Math.floor(base - session.totalPausedSeconds));
}

export interface PauseInput {
  session: TrackingSession;
  now: number;
}

/** Pause a running session. Returns updated session + seconds to add. */
export function pauseSession({ session, now }: PauseInput): TrackingSession {
  if (session.status !== "running") return session;
  return {
    ...session,
    status: "paused",
    pausedAt: new Date(now).toISOString(),
    totalActiveSeconds: elapsedSeconds(session, now),
    totalIdleSeconds: session.totalIdleSeconds,
  };
}

export interface ResumeInput {
  session: TrackingSession;
  now: number;
}

/** Resume a paused session, adding the paused interval to the pause total. */
export function resumeSession({ session, now }: ResumeInput): TrackingSession {
  if (session.status !== "paused" || !session.pausedAt) return session;
  const pausedSeconds = Math.floor((now - new Date(session.pausedAt).getTime()) / 1000);
  return {
    ...session,
    status: "running",
    pausedAt: null,
    totalPausedSeconds: session.totalPausedSeconds + Math.max(0, pausedSeconds),
  };
}

export interface StopInput {
  session: TrackingSession;
  now: number;
}

export function stopSession({ session, now }: StopInput): TrackingSession {
  const wasRunning = session.status === "running";
  const wasPaused = session.status === "paused";
  return {
    ...session,
    status: "stopped",
    endedAt: new Date(now).toISOString(),
    pausedAt: null,
    totalActiveSeconds: wasRunning ? elapsedSeconds(session, now) : session.totalActiveSeconds,
  };
}

export function isUnfinishedSession(session: TrackingSession): boolean {
  return session.status === "running" || session.status === "paused" || session.status === "pending_recovery";
}

/** A session that was running when the app closed is recovered as pending_recovery. */
export function markForRecovery(session: TrackingSession, now: number): TrackingSession {
  if (session.status === "running") {
    return { ...session, status: "pending_recovery", endedAt: new Date(now).toISOString() };
  }
  return session;
}
