// ─────────────────────────────────────────────────────────────
// Shared domain types. These mirror the Rust/SQLite model and the
// future REST API exactly, so the mock adapter and the Tauri
// adapter can share one surface.
// ─────────────────────────────────────────────────────────────

export type SyncStatus = "synced" | "pending" | "failed" | "in_flight";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "freelancer";
  avatarUrl: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  logoUrl: string | null;
  role: User["role"];
  companyPolicy: {
    allowScreenshotDeletion: boolean;
    autoPauseOnIdle: boolean;
    requireManualNotes: boolean;
    screenshotFrequencyMinutes: number;
  };
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  client: string | null;
  color: string;
  isActive: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  isActive: boolean;
}

export type SessionStatus = "running" | "paused" | "stopped" | "pending_recovery";

export interface TrackingSession {
  id: string;
  workspaceId: string;
  userId: string;
  projectId: string;
  taskId: string | null;
  note: string | null;
  startedAt: string; // ISO
  endedAt: string | null;
  pausedAt: string | null;
  status: SessionStatus;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  totalPausedSeconds: number;
  isManual: boolean;
  isPrivate: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
}

export interface ActivityBlock {
  id: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  keyboardCount: number;
  mouseClickCount: number;
  mouseActivityScore: number; // 0-100
  activeSeconds: number;
  idleSeconds: number;
  activityPercentage: number; // 0-100
  syncStatus: SyncStatus;
}

export type UploadStatus = "pending" | "encrypted" | "uploaded" | "failed" | "deleted";

export interface Screenshot {
  id: string;
  sessionId: string;
  capturedAt: string;
  localPath: string | null;
  encryptedPath: string | null;
  uploadStatus: UploadStatus;
  screenNumber: number;
  redactionApplied: boolean;
  previewDataUrl: string | null;
}

export interface AppUsageSummary {
  id: string;
  sessionId: string;
  appName: string;
  durationSeconds: number;
  syncStatus: SyncStatus;
}

export interface ManualTimeEntry {
  id: string;
  workspaceId: string;
  userId: string;
  projectId: string;
  taskId: string | null;
  date: string; // YYYY-MM-DD
  hours: number;
  minutes: number;
  note: string | null;
  isBillable: boolean;
  syncStatus: SyncStatus;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType:
    | "session_started"
    | "session_paused"
    | "session_resumed"
    | "session_stopped"
    | "screenshot_captured"
    | "screenshot_deleted"
    | "permission_denied"
    | "sync_failure"
    | "sync_success"
    | "settings_changed"
    | "private_mode_toggled"
    | "app_launched";
  detail: string;
  metadata: Record<string, unknown> | null;
}

// ── Settings ─────────────────────────────────────────────────

export type ScreenCaptureMode = "primary" | "all";

export interface AppSettings {
  workspaceId: string;
  screenCaptureEnabled: boolean;
  screenshotFrequencyMinutes: number; // capture window within each N-minute block
  screenCaptureMode: ScreenCaptureMode;
  screenshotBlur: boolean;
  blurAmount: number; // 0-40 px
  idleTimeoutMinutes: number; // default 5
  autoPauseOnIdle: boolean;
  trackAppUsage: boolean;
  excludedApps: string[];
  excludedDomains: string[];
  privateMode: boolean;
  dataRetentionDays: number;
  encryptionEnabled: boolean;
  syncEnabled: boolean;
  askBeforeCaptureSetup: boolean;
  onboardingComplete: boolean;
}

// ── Sync queue ───────────────────────────────────────────────

export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  status: "pending" | "in_flight" | "failed";
  attempts: number;
  nextRetryAt: number; // epoch ms
  lastError: string | null;
  createdAt: number;
}

export interface SyncState {
  connected: boolean;
  mode: "online" | "offline";
  lastSyncAt: number | null;
  queueLength: number;
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  backendUrl: string | null;
  usingMock: boolean;
}

// ── Aggregate views ──────────────────────────────────────────

export interface DaySummary {
  date: string;
  totalSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  manualSeconds: number;
  activityPercentage: number;
  screenshotCount: number;
  projectBreakdown: Array<{ projectId: string; projectName: string; seconds: number; color: string }>;
}

export interface DashboardData {
  todayTotalSeconds: number;
  todayActiveSeconds: number;
  todayIdleSeconds: number;
  todayActivityPercentage: number;
  todayScreenshotCount: number;
  todayBlocks: ActivityBlock[];
  todayScreenshots: Screenshot[];
  todayAppUsage: AppUsageSummary[];
}

export interface WeekData {
  startDate: string; // ISO date of week start (Monday)
  days: DaySummary[];
}

// ── Requests ─────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface StartTrackingRequest {
  projectId: string;
  taskId: string | null;
  note: string | null;
}

export interface ManualEntryRequest {
  projectId: string;
  taskId: string | null;
  date: string;
  hours: number;
  minutes: number;
  note: string | null;
  isBillable: boolean;
}

export interface CaptureResult {
  screenshot: Screenshot;
  notificationShown: boolean;
}

// ── Misc ─────────────────────────────────────────────────────

export type TrackerMode = "mock" | "tauri";
