import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { listen } from "@tauri-apps/api/event";
import { api, isTauriRuntime } from "@/services/api/client";
import { pauseSession, resumeSession, stopSession } from "@/services/timer";
import { evaluateIdle, nextCaptureWindow, randomCaptureTime } from "@/services/activity";
import type { ActivityBlock, Screenshot, TrackingSession, AppUsageSummary } from "@/types";
import { useAuthStore } from "./authStore";
import { playCameraShutterSound } from "@/utils/sound";

// ─────────────────────────────────────────────────────────────
// Tracker state machine. Owns the active session, the live clock,
// idle detection, the activity sample buffer, screenshot scheduling
// and the app-usage sample buffer. All writes go through api so
// the native layer stays the source of truth.
// ─────────────────────────────────────────────────────────────

export type TimerPhase = "idle" | "running" | "paused";

interface SampleWindow {
  start: number;
  lastInputAt: number | null;
  keyboardCount: number;
  mouseClickCount: number;
  mouseMoveDistance: number;
  idleSeconds: number;
  appUsage: Map<string, number>;
}

interface CapturePlan {
  windowStart: number;
  nextAt: number;
  lastCapturedAt: number | null;
}

interface TrackerState {
  session: TrackingSession | null;
  phase: TimerPhase;
  recoveredSession: TrackingSession | null;
  elapsed: number; // active seconds displayed
  idle: boolean;
  idleSeconds: number;
  lastInputAt: number | null;
  activityPercentage: number;
  recentBlocks: ActivityBlock[];
  recentScreenshots: Screenshot[];
  recentAppUsage: AppUsageSummary[];
  capturePlan: CapturePlan | null;
  lastCaptureAt: number | null;
  sampleWindow: SampleWindow | null;
  captureNoticeVisible: boolean;
  screenshotCaptureEnabled: boolean;

  initialize: () => Promise<void>;
  start: (projectId: string, taskId: string | null, note: string | null) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  continueRecovered: () => Promise<void>;
  discardRecovered: () => Promise<void>;
  registerInput: (kind: "keyboard" | "click" | "move", amount?: number) => void;
  setLastInputAt: (ms: number) => void;
  flushSampleWindow: () => Promise<void>;
  tick: () => Promise<void>;
  maybeCapture: () => Promise<void>;
  triggerScreenshot: () => Promise<void>;
  dismissCaptureNotice: () => void;
  deleteScreenshot: (id: string) => Promise<void>;
  refreshRecent: () => Promise<void>;
}

const IDLE_POLL_MS = 1000;

// ── native wiring ────────────────────────────────────────────
// When running inside the Tauri shell the Rust layer feeds real
// input deltas (tracker:input), tray-driven phase changes
// (tracker:phase) and the active application (tracker:app).

interface NativeInputSample {
  keyboardCount: number;
  mouseClickCount: number;
  movementScore: number;
  lastInputAt: number | null;
  eventsReceived: number;
  hasPermission: boolean;
}

let nativeListenersRegistered = false;

function registerNativeListeners() {
  if (nativeListenersRegistered || !isTauriRuntime()) return;
  nativeListenersRegistered = true;

  listen<NativeInputSample>("tracker:input", (event) => {
    const p = event.payload;
    const state = useTrackerStore.getState();
    if (!state.sampleWindow) return;
    if (p.keyboardCount > 0) state.registerInput("keyboard", p.keyboardCount);
    if (p.mouseClickCount > 0) state.registerInput("click", p.mouseClickCount);
    if (p.movementScore > 0) state.registerInput("move", p.movementScore);
    if (p.lastInputAt) state.setLastInputAt(p.lastInputAt);
  });

  listen<{ session: TrackingSession | null }>("tracker:phase", (event) => {
    const session = event.payload.session;
    if (!session) {
      useTrackerStore.setState({ session: null, phase: "idle", recoveredSession: null, idle: false, capturePlan: null });
      return;
    }
    const phase: TimerPhase = session.status === "paused" ? "paused" : "running";
    const currentSampleWindow = useTrackerStore.getState().sampleWindow;
    const sampleWindow =
      phase === "running" && !currentSampleWindow
        ? {
            start: Date.now(),
            lastInputAt: Date.now(),
            keyboardCount: 0,
            mouseClickCount: 0,
            mouseMoveDistance: 0,
            idleSeconds: 0,
            appUsage: new Map(),
          }
        : currentSampleWindow;

    useTrackerStore.setState({ session, phase, idle: false, sampleWindow, lastInputAt: Date.now() });
  });

  listen<{ appName: string | null }>("tracker:app", (event) => {
    const name = event.payload.appName;
    if (!name) return;
    const w = useTrackerStore.getState().sampleWindow;
    if (!w) return;
    const current = w.appUsage.get(name) ?? 0;
    w.appUsage.set(name, current + 5);
  });
}

export const useTrackerStore = create<TrackerState>((set, get) => ({
  session: null,
  phase: "idle",
  recoveredSession: null,
  elapsed: 0,
  idle: false,
  idleSeconds: 0,
  lastInputAt: null,
  activityPercentage: 0,
  recentBlocks: [],
  recentScreenshots: [],
  recentAppUsage: [],
  capturePlan: null,
  lastCaptureAt: null,
  sampleWindow: null,
  captureNoticeVisible: false,
  screenshotCaptureEnabled: true,

  async initialize() {
    registerNativeListeners();
    const [active, recovered] = await Promise.all([
      api.getActiveSession(),
      api.recoverUnfinishedSession(),
    ]);
    if (active) {
      const phase: TimerPhase = active.status === "paused" ? "paused" : "running";
      set({ session: active, phase });
      get().tick();
    } else if (recovered) {
      set({ recoveredSession: recovered });
    }
    await get().refreshRecent();
  },

  async start(projectId, taskId, note) {
    const session = await api.startTracking({ projectId, taskId, note });
    const settings = useAuthStore.getState().settings;
    const freqMs = (settings?.screenshotFrequencyMinutes ?? 10) * 60_000;
    const randomOffset = Math.floor(Math.random() * (freqMs - 60_000)) + 30_000;
    set({
      session,
      phase: "running",
      elapsed: 0,
      idle: false,
      idleSeconds: 0,
      lastInputAt: null,
      sampleWindow: {
        start: Date.now(),
        lastInputAt: null,
        keyboardCount: 0,
        mouseClickCount: 0,
        mouseMoveDistance: 0,
        idleSeconds: 0,
        appUsage: new Map(),
      },
      capturePlan: {
        windowStart: Date.now(),
        nextAt: Date.now() + randomOffset,
        lastCapturedAt: null,
      },
      lastCaptureAt: null,
    });
  },

  async pause() {
    const { session } = get();
    if (!session) return;
    const updated = pauseSession({ session, now: Date.now() });
    const synced = await api.pauseTracking(updated.id);
    set({ session: synced, phase: "paused", idle: false });
  },

  async resume() {
    const { session } = get();
    if (!session) return;
    const updated = resumeSession({ session, now: Date.now() });
    const synced = await api.resumeTracking(updated.id);
    set({ session: synced, phase: "running", idle: false, lastInputAt: Date.now() });
  },

  async stop() {
    const { session } = get();
    if (!session) return;
    await get().flushSampleWindow();
    const updated = stopSession({ session, now: Date.now() });
    await api.stopTracking(updated.id);
    set({
      session: null,
      phase: "idle",
      elapsed: 0,
      sampleWindow: null,
      capturePlan: null,
      lastCaptureAt: null,
      idle: false,
    });
    await get().refreshRecent();
  },

  async continueRecovered() {
    const { recoveredSession } = get();
    if (!recoveredSession) return;
    const resumed = resumeSession({ session: recoveredSession, now: Date.now() });
    const synced = await api.resumeTracking(resumed.id);
    set({
      session: synced,
      phase: "running",
      recoveredSession: null,
      sampleWindow: {
        start: Date.now(),
        lastInputAt: null,
        keyboardCount: 0,
        mouseClickCount: 0,
        mouseMoveDistance: 0,
        idleSeconds: 0,
        appUsage: new Map(),
      },
    });
  },

  async discardRecovered() {
    const { recoveredSession } = get();
    if (!recoveredSession) return;
    await api.discardRecoveredSession(recoveredSession.id);
    set({ recoveredSession: null });
  },

  registerInput(kind, amount = 1) {
    const w = get().sampleWindow;
    if (!w) return;
    if (kind === "keyboard") w.keyboardCount += amount;
    if (kind === "click") w.mouseClickCount += amount;
    if (kind === "move") w.mouseMoveDistance += amount;
    w.lastInputAt = Date.now();
  },

  setLastInputAt(ms) {
    set({ lastInputAt: ms });
  },

  async tick() {
    const state = get();
    if (!state.session || state.phase !== "running") return;

    const now = Date.now();
    const settings = useAuthStore.getState().settings;
    const timeoutMs = (settings?.idleTimeoutMinutes ?? 5) * 60_000;

    const idleInfo = evaluateIdle(state.lastInputAt, now, timeoutMs / 1000);
    const wasIdle = state.idle;
    set({ idle: idleInfo.isIdle, idleSeconds: idleInfo.idleSeconds });

    if (idleInfo.isIdle && !wasIdle) {
      set({ idle: true });
    }

    // Auto-pause on idle if the workspace policy allows it.
    if (idleInfo.isIdle && settings?.autoPauseOnIdle && state.phase === "running") {
      await get().pause();
      return;
    }

    const elapsed = Math.floor((now - new Date(state.session.startedAt).getTime()) / 1000) - state.session.totalPausedSeconds;
    set({ elapsed: Math.max(0, elapsed) });
    await get().maybeCapture();
  },

  async flushSampleWindow() {
    const { session, sampleWindow } = get();
    if (!session || !sampleWindow) return;
    const now = Date.now();
    const windowMs = now - sampleWindow.start;
    if (windowMs < 15_000) return; // too small to be meaningful

    const idleSeconds = sampleWindow.idleSeconds;
    const block = {
      startedAt: new Date(sampleWindow.start).toISOString(),
      endedAt: new Date(now).toISOString(),
      keyboardCount: sampleWindow.keyboardCount,
      mouseClickCount: sampleWindow.mouseClickCount,
      mouseActivityScore: Math.round(Math.min(sampleWindow.mouseMoveDistance / 4000, 1) * 100),
      activeSeconds: Math.max(0, Math.round(windowMs / 1000) - idleSeconds),
      idleSeconds,
      activityPercentage: windowMs > 0 ? Math.round(((windowMs / 1000 - idleSeconds) / (windowMs / 1000)) * 100) : 0,
      syncStatus: "pending" as const,
    };
    const saved = await api.saveActivityBlock(session.id, block);

    // Persist app usage samples.
    if (useAuthStore.getState().settings?.trackAppUsage) {
      for (const [appName, seconds] of sampleWindow.appUsage) {
        if (seconds < 10) continue;
        await api.saveAppUsage(session.id, { appName, durationSeconds: Math.round(seconds) });
      }
    }

    set((s) => ({ recentBlocks: [...s.recentBlocks.slice(-29), saved] }));
  },

  async maybeCapture() {
    const state = get();
    if (!state.session || state.phase !== "running" || (state as any).isCapturing) return;
    const settings = useAuthStore.getState().settings;
    if (!settings?.screenCaptureEnabled || !state.screenshotCaptureEnabled) return;

    const now = Date.now();
    const freqMs = (settings?.screenshotFrequencyMinutes ?? 10) * 60_000;
    const plan = state.capturePlan;

    if (plan && now >= plan.nextAt) {
      (useTrackerStore.setState as any)({ isCapturing: true });
      const nextRandomAt = now + Math.floor(Math.random() * (freqMs - 60_000)) + 30_000;
      set({
        capturePlan: {
          windowStart: now,
          nextAt: nextRandomAt,
          lastCapturedAt: now,
        },
      });
      try {
        const { screenshot } = await api.captureScreenshot(state.session.id);
        playCameraShutterSound();
        set((s) => ({
          recentScreenshots: [screenshot, ...s.recentScreenshots.slice(0, 23)],
          captureNoticeVisible: true,
          lastCaptureAt: now,
        }));
      } catch (err) {
        console.warn("Screenshot capture skipped:", err);
      } finally {
        (useTrackerStore.setState as any)({ isCapturing: false });
      }
    }

    // Advance plan window every frequency interval even if no shot was due.
    if (!plan || now >= plan.windowStart + freqMs) {
      const windowStart = plan ? plan.windowStart + freqMs : now;
      const nextRandomAt = windowStart + Math.floor(Math.random() * (freqMs - 60_000)) + 30_000;
      set({
        capturePlan: {
          windowStart,
          nextAt: nextRandomAt,
          lastCapturedAt: plan?.lastCapturedAt ?? null,
        },
      });
    }
  },

  async triggerScreenshot() {
    const state = get();
    if (!state.session) return;
    try {
      const { screenshot } = await api.captureScreenshot(state.session.id);
      playCameraShutterSound();
      const now = Date.now();
      set((s) => ({
        recentScreenshots: [screenshot, ...s.recentScreenshots.slice(0, 23)],
        captureNoticeVisible: true,
        lastCaptureAt: now,
      }));
    } catch (err) {
      console.warn("Manual screenshot capture error:", err);
    }
  },

  dismissCaptureNotice() {
    set({ captureNoticeVisible: false });
  },

  async deleteScreenshot(id) {
    await api.deleteScreenshot(id);
    set((s) => ({ recentScreenshots: s.recentScreenshots.filter((x) => x.id !== id) }));
  },

  async refreshRecent() {
    const [blocks, screenshots] = await Promise.all([
      api.getDashboard(),
      api.listScreenshots(),
    ]);
    set({
      recentBlocks: blocks.todayBlocks.slice(-30),
      recentScreenshots: blocks.todayScreenshots.slice(0, 24),
      recentAppUsage: blocks.todayAppUsage,
      activityPercentage: blocks.todayActivityPercentage,
    });
  },
}));

export { IDLE_POLL_MS };
