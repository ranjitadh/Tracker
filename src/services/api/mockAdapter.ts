import { v4 as uuidv4 } from "uuid";
import { removePendingByEntityId } from "@/services/syncQueue";
import type {
  ActivityBlock,
  AppSettings,
  AppUsageSummary,
  AuditEvent,
  CaptureResult,
  DashboardData,
  DaySummary,
  ManualEntryRequest,
  ManualTimeEntry,
  Project,
  Screenshot,
  StartTrackingRequest,
  SyncQueueItem,
  Task,
  TrackingSession,
  User,
  WeekData,
  Workspace,
} from "@/types";
import { enqueue, enqueueReplaceIfPending, getQueueSnapshot, flushQueue, updateState } from "@/services/syncQueue";
import { computeActivityBlock, BLOCK_SECONDS } from "@/services/activity";
import type { Api } from "./client";

// ─────────────────────────────────────────────────────────────
// Mock backend adapter. Provides a complete REST-style surface
// backed by localStorage so the full desktop UX is testable with
// `npm run dev` and no native layer. Mirrors the future real API.
// ─────────────────────────────────────────────────────────────

const DB_KEY = "time-tracker.mockdb";
const LATENCY = 40;

export interface MockDb {
  users: User[];
  workspaces: Workspace[];
  projects: Project[];
  tasks: Task[];
  sessions: TrackingSession[];
  blocks: ActivityBlock[];
  screenshots: Screenshot[];
  appUsage: AppUsageSummary[];
  manualEntries: ManualTimeEntry[];
  settings: AppSettings | null;
  audit: AuditEvent[];
  activeUserId: string | null;
  activeWorkspaceId: string | null;
}

const delay = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));

function seed(): MockDb {
  const now = Date.now();
  const today = new Date().toISOString();

  const users: User[] = [
    { id: "u-1", name: "Admin User", email: "admin@admin.com", role: "owner", avatarUrl: null },
    { id: "u-2", name: "Alex Rivera", email: "alex@acme.test", role: "member", avatarUrl: null },
    { id: "u-3", name: "Sam Chen", email: "sam@acme.test", role: "owner", avatarUrl: null },
  ];

  const workspaces: Workspace[] = [
    {
      id: "w-1",
      name: "Acme Software",
      logoUrl: null,
      role: "member",
      companyPolicy: {
        allowScreenshotDeletion: true,
        autoPauseOnIdle: true,
        requireManualNotes: false,
        screenshotFrequencyMinutes: 10,
      },
    },
    {
      id: "w-2",
      name: "Northstar Design",
      logoUrl: null,
      role: "freelancer",
      companyPolicy: {
        allowScreenshotDeletion: true,
        autoPauseOnIdle: false,
        requireManualNotes: false,
        screenshotFrequencyMinutes: 10,
      },
    },
  ];

  const projects: Project[] = [
    { id: "p-1", workspaceId: "w-1", name: "Website Redesign", client: "Acme Corp", color: "#4F8CFF", isActive: true },
    { id: "p-2", workspaceId: "w-1", name: "Mobile App", client: "Acme Corp", color: "#22C55E", isActive: true },
    { id: "p-3", workspaceId: "w-1", name: "Internal Tooling", client: "Acme Corp", color: "#F59E0B", isActive: true },
    { id: "p-4", workspaceId: "w-2", name: "Brand Refresh", client: "Northstar", color: "#A78BFA", isActive: true },
  ];

  const tasks: Task[] = [
    { id: "t-1", projectId: "p-1", name: "Design system", isActive: true },
    { id: "t-2", projectId: "p-1", name: "Homepage layout", isActive: true },
    { id: "t-3", projectId: "p-2", name: "Onboarding flow", isActive: true },
    { id: "t-4", projectId: "p-2", name: "Push notifications", isActive: true },
    { id: "t-5", projectId: "p-3", name: "CLI tooling", isActive: true },
    { id: "t-6", projectId: "p-4", name: "Logo exploration", isActive: true },
  ];

  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  const sessions: TrackingSession[] = [
    {
      id: "s-1",
      workspaceId: "w-1",
      userId: "u-1",
      projectId: "p-1",
      taskId: "t-1",
      note: "Working on the design system tokens",
      startedAt: minutesAgo(3 * 60),
      endedAt: minutesAgo(2 * 60),
      pausedAt: null,
      status: "stopped",
      totalActiveSeconds: 3590,
      totalIdleSeconds: 240,
      totalPausedSeconds: 0,
      isManual: false,
      isPrivate: false,
      syncStatus: "synced",
      syncError: null,
    },
    {
      id: "s-2",
      workspaceId: "w-1",
      userId: "u-1",
      projectId: "p-2",
      taskId: "t-3",
      note: "Onboarding flow implementation",
      startedAt: minutesAgo(120),
      endedAt: minutesAgo(62),
      pausedAt: null,
      status: "stopped",
      totalActiveSeconds: 3365,
      totalIdleSeconds: 260,
      totalPausedSeconds: 0,
      isManual: false,
      isPrivate: false,
      syncStatus: "synced",
      syncError: null,
    },
    {
      id: "s-3",
      workspaceId: "w-1",
      userId: "u-1",
      projectId: "p-1",
      taskId: "t-2",
      note: "Homepage hero section",
      startedAt: minutesAgo(90),
      endedAt: minutesAgo(45),
      pausedAt: null,
      status: "stopped",
      totalActiveSeconds: 2680,
      totalIdleSeconds: 180,
      totalPausedSeconds: 0,
      isManual: false,
      isPrivate: false,
      syncStatus: "synced",
      syncError: null,
    },
    {
      id: "s-4",
      workspaceId: "w-1",
      userId: "u-1",
      projectId: "p-3",
      taskId: "t-5",
      note: "CLI parity work",
      startedAt: minutesAgo(40),
      endedAt: minutesAgo(15),
      pausedAt: null,
      status: "stopped",
      totalActiveSeconds: 1400,
      totalIdleSeconds: 210,
      totalPausedSeconds: 0,
      isManual: false,
      isPrivate: false,
      syncStatus: "synced",
      syncError: null,
    },
  ];

  const blockSeed = (session: TrackingSession, offsetMin: number, counts: [number, number, number]): ActivityBlock => {
    const start = new Date(new Date(session.startedAt).getTime() + offsetMin * 60_000);
    const base = computeActivityBlock({
      startedAt: start.getTime(),
      endedAt: start.getTime() + BLOCK_SECONDS * 1000,
      counters: { keyboardEvents: counts[0], mouseClickEvents: counts[1], mouseMoveDistance: counts[2] },
      idleSeconds: 0,
    });
    return { ...base, id: uuidv4(), sessionId: session.id, syncStatus: "synced" };
  };

  const blocks: ActivityBlock[] = [
    blockSeed(sessions[0], 0, [42, 8, 6200]),
    blockSeed(sessions[0], 10, [30, 4, 3800]),
    blockSeed(sessions[0], 20, [12, 2, 900]),
    blockSeed(sessions[0], 30, [55, 11, 8100]),
    blockSeed(sessions[0], 40, [0, 0, 0]),
    blockSeed(sessions[1], 0, [38, 6, 5100]),
    blockSeed(sessions[1], 10, [44, 9, 6400]),
    blockSeed(sessions[1], 20, [20, 3, 2200]),
    blockSeed(sessions[1], 30, [48, 12, 7000]),
    blockSeed(sessions[2], 0, [60, 14, 9000]),
    blockSeed(sessions[2], 10, [35, 5, 4400]),
    blockSeed(sessions[2], 20, [0, 0, 0]),
    blockSeed(sessions[2], 30, [28, 7, 3600]),
    blockSeed(sessions[2], 40, [18, 4, 2100]),
  ];

  const screenshots: Screenshot[] = [
    { id: "ss-1", sessionId: "s-1", capturedAt: minutesAgo(175), localPath: null, encryptedPath: "mock/ss-1.bin", uploadStatus: "uploaded", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(175)) },
    { id: "ss-2", sessionId: "s-1", capturedAt: minutesAgo(165), localPath: null, encryptedPath: "mock/ss-2.bin", uploadStatus: "uploaded", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(165)) },
    { id: "ss-3", sessionId: "s-1", capturedAt: minutesAgo(155), localPath: null, encryptedPath: "mock/ss-3.bin", uploadStatus: "uploaded", screenNumber: 2, redactionApplied: true, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(155)) },
    { id: "ss-4", sessionId: "s-2", capturedAt: minutesAgo(115), localPath: null, encryptedPath: "mock/ss-4.bin", uploadStatus: "uploaded", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(115)) },
    { id: "ss-5", sessionId: "s-2", capturedAt: minutesAgo(105), localPath: null, encryptedPath: "mock/ss-5.bin", uploadStatus: "uploaded", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(105)) },
    { id: "ss-6", sessionId: "s-2", capturedAt: minutesAgo(95), localPath: null, encryptedPath: "mock/ss-6.bin", uploadStatus: "pending", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(95)) },
    { id: "ss-7", sessionId: "s-3", capturedAt: minutesAgo(80), localPath: null, encryptedPath: "mock/ss-7.bin", uploadStatus: "uploaded", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(80)) },
    { id: "ss-8", sessionId: "s-3", capturedAt: minutesAgo(70), localPath: null, encryptedPath: "mock/ss-8.bin", uploadStatus: "uploaded", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(70)) },
    { id: "ss-9", sessionId: "s-3", capturedAt: minutesAgo(60), localPath: null, encryptedPath: "mock/ss-9.bin", uploadStatus: "failed", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(60)) },
    { id: "ss-10", sessionId: "s-4", capturedAt: minutesAgo(35), localPath: null, encryptedPath: "mock/ss-10.bin", uploadStatus: "pending", screenNumber: 1, redactionApplied: false, previewDataUrl: fakeScreenshot("#131A22", minutesAgo(35)) },
  ];

  const appUsage: AppUsageSummary[] = [
    { id: "au-1", sessionId: "s-1", appName: "VS Code", durationSeconds: 3100, syncStatus: "synced" },
    { id: "au-2", sessionId: "s-1", appName: "Chrome", durationSeconds: 490, syncStatus: "synced" },
    { id: "au-3", sessionId: "s-2", appName: "Figma", durationSeconds: 2100, syncStatus: "synced" },
    { id: "au-4", sessionId: "s-2", appName: "VS Code", durationSeconds: 1265, syncStatus: "synced" },
    { id: "au-5", sessionId: "s-3", appName: "VS Code", durationSeconds: 1800, syncStatus: "synced" },
    { id: "au-6", sessionId: "s-3", appName: "Slack", durationSeconds: 880, syncStatus: "synced" },
  ];

  const manualEntries: ManualTimeEntry[] = [
    { id: "m-1", workspaceId: "w-1", userId: "u-1", projectId: "p-1", taskId: "t-1", date: today.slice(0, 10), hours: 0, minutes: 30, note: "Design review notes", isBillable: true, syncStatus: "synced" },
  ];

  const settings: AppSettings = {
    workspaceId: "w-1",
    screenCaptureEnabled: true,
    screenshotFrequencyMinutes: 10,
    screenCaptureMode: "primary",
    screenshotBlur: false,
    blurAmount: 18,
    idleTimeoutMinutes: 5,
    autoPauseOnIdle: true,
    trackAppUsage: true,
    excludedApps: ["Keychain Access"],
    excludedDomains: [],
    privateMode: false,
    dataRetentionDays: 180,
    encryptionEnabled: true,
    syncEnabled: true,
    askBeforeCaptureSetup: true,
    onboardingComplete: false,
  };

  return {
    users,
    workspaces,
    projects,
    tasks,
    sessions,
    blocks,
    screenshots,
    appUsage,
    manualEntries,
    settings,
    audit: [],
    activeUserId: "u-1",
    activeWorkspaceId: "w-1",
  };
}

function fakeScreenshot(color: string, capturedAt: string): string {
  const h = 180;
  const w = 320;
  const time = new Date(capturedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1A232E"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect x="14" y="14" width="120" height="14" rx="7" fill="#263241"/>
    <rect x="14" y="42" width="${w - 28}" height="90" rx="8" fill="#131A22" opacity="0.85"/>
    <rect x="14" y="142" width="80" height="12" rx="6" fill="#263241"/>
    <text x="${w - 14}" y="${h - 10}" text-anchor="end" font-family="monospace" font-size="11" fill="#8A99AD">${time}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function loadDb(): MockDb {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const fresh = seed();
    saveDb(fresh);
    return fresh;
  }
  try {
    return JSON.parse(raw) as MockDb;
  } catch {
    const fresh = seed();
    saveDb(fresh);
    return fresh;
  }
}

function saveDb(db: MockDb) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function audit(db: MockDb, type: AuditEvent["eventType"], detail: string, metadata: Record<string, unknown> | null = null) {
  db.audit.push({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    eventType: type,
    detail,
    metadata,
  });
  if (db.audit.length > 500) db.audit = db.audit.slice(-500);
}

function currentUser(db: MockDb): User {
  const user = db.users.find((u) => u.id === db.activeUserId) ?? db.users[0];
  return user;
}

function mockUpload(item: SyncQueueItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = loadDb();
    const failedTargets = ["screenshots", "activity_blocks"];
    const shouldFail = Math.random() < 0.08;
    if (shouldFail && failedTargets.includes(item.entityType)) {
      reject(new Error("Simulated network failure (mock backend)"));
      return;
    }
    if (item.entityType === "activity_blocks") {
      const block = item.payload as Partial<ActivityBlock>;
      const existing = db.blocks.find((b) => b.id === item.entityId);
      if (existing) Object.assign(existing, block, { syncStatus: "synced" });
      else db.blocks.push({ ...(block as ActivityBlock), id: item.entityId, syncStatus: "synced" });
      saveDb(db);
    }
    if (item.entityType === "screenshots") {
      const shot = db.screenshots.find((s) => s.id === item.entityId);
      if (shot) shot.uploadStatus = "uploaded";
      saveDb(db);
    }
    if (item.entityType === "tracking_sessions") {
      const s = db.sessions.find((x) => x.id === item.entityId);
      if (s) s.syncStatus = "synced";
      saveDb(db);
    }
    if (item.entityType === "manual_time_entries") {
      const m = db.manualEntries.find((x) => x.id === item.entityId);
      if (m) m.syncStatus = "synced";
      saveDb(db);
    }
    resolve();
  });
}

export const mockApi: Api = {
  name: "mock",

  async login(req) {
    await delay();
    const db = loadDb();
    const user = db.users.find((u) => u.email.toLowerCase() === req.email.toLowerCase()) ?? db.users[0];
    if (req.password !== "admin" && req.password !== "demo") {
      throw new Error("Invalid credentials. Try admin@admin.com / admin");
    }
    db.activeUserId = user.id;
    db.activeWorkspaceId = db.workspaces[0].id;
    audit(db, "app_launched", `User ${user.name} signed in`, { email: user.email });
    saveDb(db);
    updateState({ connected: true, mode: "online", lastSyncAt: Date.now(), usingMock: true });
    return { user, workspaces: db.workspaces };
  },

  async logout() {
    await delay();
    const db = loadDb();
    db.activeUserId = null;
    saveDb(db);
    updateState({ connected: false });
  },

  async listWorkspaces() {
    await delay();
    return loadDb().workspaces;
  },

  async selectWorkspace(workspaceId) {
    await delay();
    const db = loadDb();
    db.activeWorkspaceId = workspaceId;
    const policy = db.workspaces.find((w) => w.id === workspaceId)?.companyPolicy;
    if (db.settings) {
      db.settings.workspaceId = workspaceId;
      db.settings.autoPauseOnIdle = policy?.autoPauseOnIdle ?? db.settings.autoPauseOnIdle;
      db.settings.screenshotFrequencyMinutes = policy?.screenshotFrequencyMinutes ?? db.settings.screenshotFrequencyMinutes;
    }
    saveDb(db);
    return { settings: db.settings ?? (await this.getSettings()) };
  },

  async listProjects() {
    await delay();
    const db = loadDb();
    return db.projects.filter((p) => p.workspaceId === db.activeWorkspaceId && p.isActive);
  },

  async listTasks(projectId) {
    await delay();
    const db = loadDb();
    return db.tasks.filter((t) => t.projectId === projectId && t.isActive);
  },

  async createProject(name, client, color) {
    await delay();
    const db = loadDb();
    const project: Project = {
      id: uuidv4(),
      workspaceId: db.activeWorkspaceId!,
      name,
      client: client ?? null,
      color: color ?? "#4F8CFF",
      isActive: true,
    };
    db.projects.push(project);
    audit(db, "settings_changed", `Created project ${name}`);
    saveDb(db);
    return project;
  },

  async createTask(projectId, name) {
    await delay();
    const db = loadDb();
    const task: Task = { id: uuidv4(), projectId, name, isActive: true };
    db.tasks.push(task);
    saveDb(db);
    return task;
  },

  async getActiveSession() {
    await delay(10);
    const db = loadDb();
    return db.sessions.find((s) => s.status === "running" || s.status === "paused") ?? null;
  },

  async recoverUnfinishedSession() {
    await delay();
    const db = loadDb();
    return db.sessions.find((s) => s.status === "pending_recovery") ?? null;
  },

  async startTracking(req) {
    await delay();
    const db = loadDb();
    const user = currentUser(db);
    const session: TrackingSession = {
      id: uuidv4(),
      workspaceId: db.activeWorkspaceId!,
      userId: user.id,
      projectId: req.projectId,
      taskId: req.taskId,
      note: req.note,
      startedAt: new Date().toISOString(),
      endedAt: null,
      pausedAt: null,
      status: "running",
      totalActiveSeconds: 0,
      totalIdleSeconds: 0,
      totalPausedSeconds: 0,
      isManual: false,
      isPrivate: db.settings?.privateMode ?? false,
      syncStatus: "pending",
      syncError: null,
    };
    db.sessions.push(session);
    audit(db, "session_started", `Tracking started on ${db.projects.find((p) => p.id === req.projectId)?.name ?? "project"}`, { sessionId: session.id });
    saveDb(db);
    enqueue("tracking_sessions", session.id, "create", session);
    return session;
  },

  async pauseTracking(sessionId) {
    await delay();
    const db = loadDb();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    session.status = "paused";
    session.pausedAt = new Date().toISOString();
    audit(db, "session_paused", "Tracking paused", { sessionId });
    saveDb(db);
    return session;
  },

  async resumeTracking(sessionId) {
    await delay();
    const db = loadDb();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    session.status = "running";
    session.pausedAt = null;
    audit(db, "session_resumed", "Tracking resumed", { sessionId });
    saveDb(db);
    return session;
  },

  async stopTracking(sessionId) {
    await delay();
    const db = loadDb();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    session.status = "stopped";
    session.endedAt = new Date().toISOString();
    session.pausedAt = null;
    audit(db, "session_stopped", "Tracking stopped", { sessionId });
    saveDb(db);
    enqueueReplaceIfPending("tracking_sessions", sessionId, "update", session);
    return session;
  },

  async discardRecoveredSession(sessionId) {
    await delay();
    const db = loadDb();
    db.sessions = db.sessions.filter((s) => s.id !== sessionId);
    saveDb(db);
  },

  async saveActivityBlock(sessionId, block) {
    await delay(10);
    const db = loadDb();
    const full = { ...block, id: block.id ?? uuidv4(), sessionId, syncStatus: "pending" } as ActivityBlock;
    const existing = db.blocks.find((b) => b.id === full.id);
    if (existing) Object.assign(existing, full);
    else db.blocks.push(full);
    saveDb(db);
    enqueue("activity_blocks", full.id, "create", full);
    return full;
  },

  async saveAppUsage(sessionId, appUsage) {
    await delay(10);
    const db = loadDb();
    const full = { ...appUsage, id: appUsage.id ?? uuidv4(), sessionId, syncStatus: "pending" } as AppUsageSummary;
    db.appUsage.push(full);
    saveDb(db);
    enqueue("app_usage_summaries", full.id, "create", full);
    return full;
  },

  async captureScreenshot(sessionId) {
    await delay(120);
    const db = loadDb();
    const settings = db.settings!;
    if (!settings.screenCaptureEnabled) throw new Error("Screen capture is disabled in settings");

    let livePreview = fakeScreenshot(settings.screenshotBlur ? "#1A2332" : "#131A22", new Date().toISOString());
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, { scale: 1, useCORS: true, logging: false });
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl && dataUrl.length > 500) {
        livePreview = dataUrl;
      }
    } catch {
      // Fallback preview
    }

    const shot: Screenshot = {
      id: uuidv4(),
      sessionId,
      capturedAt: new Date().toISOString(),
      localPath: null,
      encryptedPath: `mock/${uuidv4()}.bin`,
      uploadStatus: "encrypted",
      screenNumber: settings.screenCaptureMode === "all" ? 2 : 1,
      redactionApplied: settings.screenshotBlur,
      previewDataUrl: livePreview,
    };
    db.screenshots.push(shot);
    audit(db, "screenshot_captured", `Screenshot captured (screen ${shot.screenNumber})`, { screenshotId: shot.id });
    saveDb(db);
    enqueue("screenshots", shot.id, "create", shot);
    return { screenshot: shot, notificationShown: true };
  },

  async listScreenshots(filter) {
    await delay();
    const db = loadDb();
    let shots = db.screenshots.slice().sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    if (filter?.date) {
      shots = shots.filter((s) => s.capturedAt.slice(0, 10) === filter.date);
    }
    if (filter?.uploadStatus) {
      shots = shots.filter((s) => s.uploadStatus === filter.uploadStatus);
    }
    if (filter?.projectId) {
      const sessionIds = new Set(db.sessions.filter((s) => s.projectId === filter.projectId).map((s) => s.id));
      shots = shots.filter((s) => sessionIds.has(s.sessionId));
    }
    return shots;
  },

  async deleteScreenshot(screenshotId) {
    await delay();
    const db = loadDb();
    const shot = db.screenshots.find((s) => s.id === screenshotId);
    if (shot) {
      shot.uploadStatus = "deleted";
      audit(db, "screenshot_deleted", "Screenshot deleted before sync", { screenshotId });
    }
    saveDb(db);
    removePendingByEntityId("screenshots", screenshotId);
    enqueueReplaceIfPending("screenshots", screenshotId, "delete", { id: screenshotId });
  },

  async getDashboard() {
    await delay();
    const db = loadDb();
    const today = new Date().toISOString().slice(0, 10);
    const todaySessions = db.sessions.filter((s) => s.startedAt.slice(0, 10) === today && s.status === "stopped");
    const todayBlocks = db.blocks.filter((b) => b.startedAt.slice(0, 10) === today);
    const todayShots = db.screenshots.filter((s) => s.capturedAt.slice(0, 10) === today && s.uploadStatus !== "deleted");
    const totalActive = todayBlocks.reduce((sum, b) => sum + b.activeSeconds, 0);
    const totalIdle = todayBlocks.reduce((sum, b) => sum + b.idleSeconds, 0);
    const totalSeconds = totalActive + totalIdle;
    const activeSessions = todaySessions.reduce((sum, s) => sum + s.totalActiveSeconds, 0);
    const combined = Math.max(totalSeconds, activeSessions);
    const activityPercentage = combined > 0 ? Math.round((Math.max(totalActive, activeSessions) / combined) * 100) : 0;
    const todayAppUsage = db.appUsage.filter((a) => {
      const session = db.sessions.find((s) => s.id === a.sessionId);
      return session && session.startedAt.slice(0, 10) === today;
    });
    return {
      todayTotalSeconds: combined,
      todayActiveSeconds: Math.max(totalActive, activeSessions),
      todayIdleSeconds: totalIdle,
      todayActivityPercentage: activityPercentage,
      todayScreenshotCount: todayShots.length,
      todayBlocks: todayBlocks.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      todayScreenshots: todayShots.slice().sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 12),
      todayAppUsage,
    } satisfies DashboardData;
  },

  async getWeek(startDate) {
    await delay();
    const db = loadDb();
    const days: DaySummary[] = [];
    const start = new Date(startDate + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const sessions = db.sessions.filter((s) => s.startedAt.slice(0, 10) === dateStr && !s.isManual);
      const blocks = db.blocks.filter((b) => b.startedAt.slice(0, 10) === dateStr);
      const manual = db.manualEntries.filter((m) => m.date === dateStr);
      const shots = db.screenshots.filter((s) => s.capturedAt.slice(0, 10) === dateStr && s.uploadStatus !== "deleted");
      const totalSeconds = blocks.reduce((sum, b) => sum + b.activeSeconds + b.idleSeconds, 0) + sessions.reduce((sum, s) => sum + s.totalActiveSeconds + s.totalIdleSeconds, 0);
      const activeSeconds = Math.max(blocks.reduce((sum, b) => sum + b.activeSeconds, 0), sessions.reduce((sum, s) => sum + s.totalActiveSeconds, 0));
      const idleSeconds = blocks.reduce((sum, b) => sum + b.idleSeconds, 0);
      const manualSeconds = manual.reduce((sum, m) => sum + m.hours * 3600 + m.minutes * 60, 0);
      const activityPercentage = totalSeconds > 0 ? Math.round((activeSeconds / totalSeconds) * 100) : 0;
      const projectBreakdown = new Map<string, { projectId: string; projectName: string; seconds: number; color: string }>();
      for (const s of sessions) {
        const p = db.projects.find((x) => x.id === s.projectId);
        if (!p) continue;
        const key = p.id;
        const cur = projectBreakdown.get(key) ?? { projectId: p.id, projectName: p.name, seconds: 0, color: p.color };
        cur.seconds += s.totalActiveSeconds;
        projectBreakdown.set(key, cur);
      }
      for (const m of manual) {
        const p = db.projects.find((x) => x.id === m.projectId);
        if (!p) continue;
        const cur = projectBreakdown.get(p.id) ?? { projectId: p.id, projectName: p.name, seconds: 0, color: p.color };
        cur.seconds += m.hours * 3600 + m.minutes * 60;
        projectBreakdown.set(p.id, cur);
      }
      days.push({
        date: dateStr,
        totalSeconds,
        activeSeconds,
        idleSeconds,
        manualSeconds,
        activityPercentage,
        screenshotCount: shots.length,
        projectBreakdown: [...projectBreakdown.values()].sort((a, b) => b.seconds - a.seconds),
      });
    }
    return { startDate, days };
  },

  async listManualEntries() {
    await delay();
    const db = loadDb();
    return db.manualEntries.filter((m) => m.workspaceId === db.activeWorkspaceId);
  },

  async addManualEntry(req) {
    await delay();
    const db = loadDb();
    const entry: ManualTimeEntry = {
      id: uuidv4(),
      workspaceId: db.activeWorkspaceId!,
      userId: currentUser(db).id,
      projectId: req.projectId,
      taskId: req.taskId,
      date: req.date,
      hours: req.hours,
      minutes: req.minutes,
      note: req.note,
      isBillable: req.isBillable,
      syncStatus: "pending",
    };
    db.manualEntries.push(entry);
    saveDb(db);
    enqueue("manual_time_entries", entry.id, "create", entry);
    return entry;
  },

  async updateManualEntry(id, req) {
    await delay();
    const db = loadDb();
    const entry = db.manualEntries.find((m) => m.id === id);
    if (!entry) throw new Error("Entry not found");
    Object.assign(entry, req, { syncStatus: "pending" });
    saveDb(db);
    enqueueReplaceIfPending("manual_time_entries", id, "update", entry);
    return entry;
  },

  async deleteManualEntry(id) {
    await delay();
    const db = loadDb();
    db.manualEntries = db.manualEntries.filter((m) => m.id !== id);
    saveDb(db);
    enqueue("manual_time_entries", id, "delete", { id });
  },

  async getSettings() {
    await delay(10);
    return loadDb().settings!;
  },

  async updateSettings(patch) {
    await delay();
    const db = loadDb();
    const merged = { ...db.settings!, ...patch };
    const changed: string[] = [];
    for (const key of Object.keys(patch)) changed.push(key);
    if (patch.privateMode !== undefined && patch.privateMode !== db.settings?.privateMode) {
      audit(db, "private_mode_toggled", patch.privateMode ? "Private mode enabled" : "Private mode disabled");
    }
    audit(db, "settings_changed", `Settings updated: ${changed.join(", ")}`, patch as Record<string, unknown>);
    db.settings = merged;
    saveDb(db);
    return merged;
  },

  async syncNow() {
    await delay();
    const db = loadDb();
    const flushed = await flushQueue(mockUpload, {
      onProgress: () => {
        /* no-op */
      },
    });
    const snapshot = getQueueSnapshot();
    if (snapshot.state.failedCount > 0) {
      audit(db, "sync_failure", `${snapshot.state.failedCount} item(s) failed to sync`);
    }
    saveDb(db);
    updateState({ connected: true, mode: "online", lastSyncAt: Date.now(), usingMock: true });
    return { flushed };
  },

  async getSyncState() {
    await delay(10);
    const snapshot = getQueueSnapshot();
    return { ...snapshot.state, usingMock: true };
  },

  async getQueue() {
    await delay(10);
    return getQueueSnapshot().items;
  },

  async listAuditEvents() {
    await delay();
    return loadDb().audit.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
};
