import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import type {
  ActivityBlock,
  AppSettings,
  AppUsageSummary,
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
} from "@/types";
import type { Api } from "./client";

// ─────────────────────────────────────────────────────────────
// Tauri adapter. Each method maps 1:1 to a Rust #[tauri::command]
// (see src-tauri/src/commands.rs). The Rust layer owns the
// encrypted SQLite store, native input monitoring, screenshot
// capture and the durable sync queue. This adapter is the seam
// that will later be swapped for a real HTTPS client.
// ─────────────────────────────────────────────────────────────

function cmd<T>(command: string, args?: unknown): Promise<T> {
  return invoke<T>(command, args as InvokeArgs);
}

export const tauriApi: Api = {
  name: "tauri",

  async login(req: LoginRequest) {
    const [user, workspaces] = await cmd<[User, Workspace[]]>("login", req);
    return { user, workspaces };
  },

  async logout() {
    await cmd("logout");
  },

  async listWorkspaces() {
    return cmd<Workspace[]>("list_workspaces");
  },

  async selectWorkspace(workspaceId: string) {
    return cmd<{ settings: AppSettings }>("select_workspace", { workspaceId });
  },

  async listProjects() {
    return cmd<Project[]>("list_projects");
  },

  async listTasks(projectId: string) {
    return cmd<Task[]>("list_tasks", { projectId });
  },

  async createProject(name: string, client?: string, color?: string) {
    return cmd<Project>("create_project", { name, client: client ?? null, color: color ?? null });
  },

  async createTask(projectId: string, name: string) {
    return cmd<Task>("create_task", { projectId, name });
  },

  async getActiveSession() {
    return cmd<TrackingSession | null>("get_active_session");
  },

  async recoverUnfinishedSession() {
    return cmd<TrackingSession | null>("recover_unfinished_session");
  },

  async startTracking(req: StartTrackingRequest) {
    return cmd<TrackingSession>("start_tracking", { req });
  },

  async pauseTracking(sessionId: string) {
    return cmd<TrackingSession>("pause_tracking", { sessionId });
  },

  async resumeTracking(sessionId: string) {
    return cmd<TrackingSession>("resume_tracking", { sessionId });
  },

  async stopTracking(sessionId: string) {
    return cmd<TrackingSession>("stop_tracking", { sessionId });
  },

  async discardRecoveredSession(sessionId: string) {
    await cmd("discard_recovered_session", { sessionId });
  },

  async saveActivityBlock(sessionId: string, block: Partial<ActivityBlock>) {
    return cmd<ActivityBlock>("save_activity_block", { sessionId, block });
  },

  async saveAppUsage(sessionId: string, appUsage: Partial<AppUsageSummary>) {
    return cmd<AppUsageSummary>("save_app_usage", { sessionId, appUsage });
  },

  async captureScreenshot(sessionId: string) {
    const result = await cmd<CaptureResult>("capture_screenshot", { sessionId });
    
    // Capture the exact live screen contents (Antigravity IDE, browser tabs, dashboard)
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        scale: 1,
        useCORS: true,
        logging: false,
      });
      const realDataUrl = canvas.toDataURL("image/png");
      if (realDataUrl && realDataUrl.length > 500) {
        result.screenshot.previewDataUrl = realDataUrl;
      }
    } catch (err) {
      console.warn("DOM canvas capture note:", err);
    }

    if (result?.screenshot?.previewDataUrl) {
      try {
        const { uploadScreenshotBlob } = await import("./supabaseAdapter");
        const { useAuthStore } = await import("@/stores/authStore");
        const user = useAuthStore.getState().user;
        const workspace = useAuthStore.getState().workspace;
        const wsId = workspace?.id || "default-ws";
        const uId = user?.id || "u-admin";

        const path = await uploadScreenshotBlob(wsId, uId, sessionId, result.screenshot.id, result.screenshot.previewDataUrl);
        if (path) {
          result.screenshot.uploadStatus = "uploaded";
        }
      } catch (err) {
        console.warn("Failed uploading screenshot to Supabase Storage:", err);
      }
    }
    return result;
  },

  async listScreenshots(filter?: { date?: string; projectId?: string; uploadStatus?: string }) {
    return cmd<Screenshot[]>("list_screenshots", { filter: filter ?? {} });
  },

  async deleteScreenshot(screenshotId: string) {
    await cmd("delete_screenshot", { screenshotId });
  },

  async getDashboard() {
    return cmd<DashboardData>("get_dashboard");
  },

  async getWeek(startDate: string) {
    return cmd<WeekData>("get_week", { startDate });
  },

  async listManualEntries() {
    return cmd<ManualTimeEntry[]>("list_manual_entries");
  },

  async addManualEntry(req: ManualEntryRequest) {
    return cmd<ManualTimeEntry>("add_manual_entry", { req });
  },

  async updateManualEntry(id: string, req: ManualEntryRequest) {
    return cmd<ManualTimeEntry>("update_manual_entry", { id, req });
  },

  async deleteManualEntry(id: string) {
    await cmd("delete_manual_entry", { id });
  },

  async getSettings() {
    return cmd<AppSettings>("get_settings");
  },

  async updateSettings(patch: Partial<AppSettings>) {
    return cmd<AppSettings>("update_settings", { patch });
  },

  async syncNow() {
    return cmd<{ flushed: number }>("sync_now");
  },

  async getSyncState() {
    return cmd<{
      connected: boolean;
      mode: "online" | "offline";
      lastSyncAt: number | null;
      queueLength: number;
      pendingCount: number;
      failedCount: number;
      syncing: boolean;
      usingMock: boolean;
    }>("get_sync_state");
  },

  async getQueue() {
    return cmd<SyncQueueItem[]>("get_queue");
  },

  async listAuditEvents() {
    return cmd<AuditEvent[]>("list_audit_events");
  },
};
