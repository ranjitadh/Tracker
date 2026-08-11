import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  pauseSession,
  resumeSession,
  stopSession,
  markForRecovery,
  isUnfinishedSession,
} from "@/services/timer";
import type { TrackingSession } from "@/types";

function session(overrides: Partial<TrackingSession> = {}): TrackingSession {
  return {
    id: "s-1",
    workspaceId: "w-1",
    userId: "u-1",
    projectId: "p-1",
    taskId: null,
    note: null,
    startedAt: new Date(NOW - 3600_000).toISOString(), // exactly 1h before NOW
    endedAt: null,
    pausedAt: null,
    status: "running",
    totalActiveSeconds: 0,
    totalIdleSeconds: 0,
    totalPausedSeconds: 0,
    isManual: false,
    isPrivate: false,
    syncStatus: "pending",
    syncError: null,
    ...overrides,
  };
}

const NOW = Date.now();

describe("elapsedSeconds", () => {
  it("counts from start minus paused time", () => {
    const s = session({ totalPausedSeconds: 600 }); // 10 min paused
    expect(elapsedSeconds(s, NOW)).toBe(3000);
  });

  it("never returns negative", () => {
    const future = session({ startedAt: new Date(Date.now() + 60_000).toISOString() });
    expect(elapsedSeconds(future, NOW)).toBe(0);
  });
});

describe("pauseSession", () => {
  it("snapshots active seconds at pause time", () => {
    const updated = pauseSession({ session: session(), now: NOW });
    expect(updated.status).toBe("paused");
    expect(updated.pausedAt).toBeTruthy();
    expect(updated.totalActiveSeconds).toBe(3600);
  });

  it("is a no-op for a paused session", () => {
    const paused = session({ status: "paused", pausedAt: new Date(NOW - 60_000).toISOString() });
    const updated = pauseSession({ session: paused, now: NOW });
    expect(updated).toEqual(paused);
  });
});

describe("resumeSession", () => {
  it("adds the paused interval to totalPausedSeconds", () => {
    const paused = session({
      status: "paused",
      pausedAt: new Date(NOW - 60_000).toISOString(),
      totalActiveSeconds: 3500,
    });
    const updated = resumeSession({ session: paused, now: NOW });
    expect(updated.status).toBe("running");
    expect(updated.pausedAt).toBeNull();
    expect(updated.totalPausedSeconds).toBe(60);
  });

  it("is a no-op for a running session", () => {
    const running = session();
    const updated = resumeSession({ session: running, now: NOW });
    expect(updated).toEqual(running);
  });
});

describe("stopSession", () => {
  it("freezes active seconds for a running session", () => {
    const updated = stopSession({ session: session(), now: NOW });
    expect(updated.status).toBe("stopped");
    expect(updated.endedAt).toBeTruthy();
    expect(updated.totalActiveSeconds).toBe(3600);
  });

  it("keeps active seconds for a paused session", () => {
    const paused = session({ status: "paused", totalActiveSeconds: 1200 });
    const updated = stopSession({ session: paused, now: NOW });
    expect(updated.totalActiveSeconds).toBe(1200);
  });
});

describe("recovery", () => {
  it("marks a running session as pending_recovery", () => {
    const updated = markForRecovery(session(), NOW);
    expect(updated.status).toBe("pending_recovery");
    expect(updated.endedAt).toBeTruthy();
  });

  it("leaves a stopped session alone", () => {
    const stopped = session({ status: "stopped" });
    const updated = markForRecovery(stopped, NOW);
    expect(updated).toEqual(stopped);
  });

  it("detects unfinished sessions", () => {
    expect(isUnfinishedSession(session({ status: "running" }))).toBe(true);
    expect(isUnfinishedSession(session({ status: "paused" }))).toBe(true);
    expect(isUnfinishedSession(session({ status: "pending_recovery" }))).toBe(true);
    expect(isUnfinishedSession(session({ status: "stopped" }))).toBe(false);
  });
});
