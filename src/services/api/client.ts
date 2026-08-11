import type {
  AppSettings,
  AuditEvent,
  CaptureResult,
  DashboardData,
  LoginRequest,
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
  ActivityBlock,
  AppUsageSummary,
} from "@/types";
import { mockApi } from "@/services/api/mockAdapter";
import { tauriApi } from "@/services/api/tauriAdapter";
import { supabaseApi } from "@/services/api/supabaseAdapter";
import { isSupabaseConfigured } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// REST-API-shaped abstraction. The app always programs against
// this interface. Three backends are available:
//
//   1. tauriApi   — Rust commands via invoke (desktop app)
//   2. supabaseApi — Real Supabase cloud backend
//   3. mockApi    — localStorage fallback (no backend needed)
//
// Priority: Tauri > Supabase > Mock
// ─────────────────────────────────────────────────────────────

export interface Api {
  name: string;

  // Auth & workspace
  login(req: LoginRequest): Promise<{ user: User; workspaces: Workspace[] }>;
  logout(): Promise<void>;
  listWorkspaces(): Promise<Workspace[]>;
  selectWorkspace(workspaceId: string): Promise<{ settings: AppSettings }>;

  // Projects & tasks
  listProjects(): Promise<Project[]>;
  listTasks(projectId: string): Promise<Task[]>;
  createProject(name: string, client?: string, color?: string): Promise<Project>;
  createTask(projectId: string, name: string): Promise<Task>;

  // Tracking
  getActiveSession(): Promise<TrackingSession | null>;
  recoverUnfinishedSession(): Promise<TrackingSession | null>;
  startTracking(req: StartTrackingRequest): Promise<TrackingSession>;
  pauseTracking(sessionId: string): Promise<TrackingSession>;
  resumeTracking(sessionId: string): Promise<TrackingSession>;
  stopTracking(sessionId: string): Promise<TrackingSession>;
  discardRecoveredSession(sessionId: string): Promise<void>;

  // Activity
  saveActivityBlock(sessionId: string, block: Partial<ActivityBlock>): Promise<ActivityBlock>;
  saveAppUsage(sessionId: string, appUsage: Partial<AppUsageSummary>): Promise<AppUsageSummary>;

  // Screenshots
  captureScreenshot(sessionId: string): Promise<CaptureResult>;
  listScreenshots(filter?: {
    date?: string;
    projectId?: string;
    uploadStatus?: string;
  }): Promise<Screenshot[]>;
  deleteScreenshot(screenshotId: string): Promise<void>;

  // Timesheet / data
  getDashboard(): Promise<DashboardData>;
  getWeek(startDate: string): Promise<WeekData>;
  listManualEntries(): Promise<ManualTimeEntry[]>;
  addManualEntry(req: ManualEntryRequest): Promise<ManualTimeEntry>;
  updateManualEntry(id: string, req: ManualEntryRequest): Promise<ManualTimeEntry>;
  deleteManualEntry(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  // Sync & audit
  syncNow(): Promise<{ flushed: number }>;
  getSyncState(): Promise<{
    connected: boolean;
    mode: "online" | "offline";
    lastSyncAt: number | null;
    queueLength: number;
    pendingCount: number;
    failedCount: number;
    syncing: boolean;
    usingMock: boolean;
  }>;
  getQueue(): Promise<SyncQueueItem[]>;
  listAuditEvents(): Promise<AuditEvent[]>;
}

function resolveApi(): Api {
  if (isTauriRuntime()) return tauriApi;
  if (isSupabaseConfigured) return supabaseApi;
  return mockApi;
}

export const api: Api = resolveApi();

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

export type { Api as ApiInterface };
