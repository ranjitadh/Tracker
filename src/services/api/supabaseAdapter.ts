import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/lib/supabase";
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
import type { Api } from "./client";

// ─────────────────────────────────────────────────────────────
// Supabase adapter. Implements the full Api interface against
// a real Supabase backend with Postgres + Auth + RLS.
//
// Column names use snake_case in Postgres; this adapter maps
// them to the camelCase types the frontend expects.
// ─────────────────────────────────────────────────────────────

function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

// ── Row ↔ Domain mappers ─────────────────────────────────────

function toUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: (row.role as User["role"]) ?? "member",
    avatarUrl: (row.avatar_url as string) ?? null,
  };
}

function toWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    name: row.name as string,
    logoUrl: (row.logo_url as string) ?? null,
    role: (row.role as Workspace["role"]) ?? "member",
    companyPolicy: {
      allowScreenshotDeletion: row.allow_screenshot_deletion as boolean,
      autoPauseOnIdle: row.auto_pause_on_idle as boolean,
      requireManualNotes: row.require_manual_notes as boolean,
      screenshotFrequencyMinutes: row.screenshot_frequency_minutes as number,
    },
  };
}

function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    client: (row.client as string) ?? null,
    color: row.color as string,
    isActive: row.is_active as boolean,
  };
}

function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    isActive: row.is_active as boolean,
  };
}

function toSession(row: Record<string, unknown>): TrackingSession {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    projectId: row.project_id as string,
    taskId: (row.task_id as string) ?? null,
    note: (row.note as string) ?? null,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? null,
    pausedAt: (row.paused_at as string) ?? null,
    status: row.status as TrackingSession["status"],
    totalActiveSeconds: (row.total_active_seconds as number) ?? 0,
    totalIdleSeconds: (row.total_idle_seconds as number) ?? 0,
    totalPausedSeconds: (row.total_paused_seconds as number) ?? 0,
    isManual: (row.is_manual as boolean) ?? false,
    isPrivate: (row.is_private as boolean) ?? false,
    syncStatus: (row.sync_status as TrackingSession["syncStatus"]) ?? "synced",
    syncError: (row.sync_error as string) ?? null,
  };
}

function toBlock(row: Record<string, unknown>): ActivityBlock {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    startedAt: row.started_at as string,
    endedAt: row.ended_at as string,
    keyboardCount: (row.keyboard_count as number) ?? 0,
    mouseClickCount: (row.mouse_click_count as number) ?? 0,
    mouseActivityScore: (row.mouse_activity_score as number) ?? 0,
    activeSeconds: (row.active_seconds as number) ?? 0,
    idleSeconds: (row.idle_seconds as number) ?? 0,
    activityPercentage: (row.activity_percentage as number) ?? 0,
    syncStatus: (row.sync_status as ActivityBlock["syncStatus"]) ?? "synced",
  };
}

function toScreenshot(row: Record<string, unknown>): Screenshot {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    capturedAt: row.captured_at as string,
    localPath: (row.local_path as string) ?? null,
    encryptedPath: (row.encrypted_path as string) ?? null,
    uploadStatus: (row.upload_status as Screenshot["uploadStatus"]) ?? "pending",
    screenNumber: (row.screen_number as number) ?? 1,
    redactionApplied: (row.redaction_applied as boolean) ?? false,
    previewDataUrl: (row.preview_data_url as string) ?? null,
  };
}

function toAppUsage(row: Record<string, unknown>): AppUsageSummary {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    appName: row.app_name as string,
    durationSeconds: (row.duration_seconds as number) ?? 0,
    syncStatus: (row.sync_status as AppUsageSummary["syncStatus"]) ?? "synced",
  };
}

function toManualEntry(row: Record<string, unknown>): ManualTimeEntry {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    projectId: row.project_id as string,
    taskId: (row.task_id as string) ?? null,
    date: row.date as string,
    hours: (row.hours as number) ?? 0,
    minutes: (row.minutes as number) ?? 0,
    note: (row.note as string) ?? null,
    isBillable: (row.is_billable as boolean) ?? true,
    syncStatus: (row.sync_status as ManualTimeEntry["syncStatus"]) ?? "synced",
  };
}

function toAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    eventType: row.event_type as AuditEvent["eventType"],
    detail: row.detail as string,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  };
}

function toSettings(row: Record<string, unknown>): AppSettings {
  return {
    workspaceId: (row.workspace_id as string) ?? "",
    screenCaptureEnabled: (row.screen_capture_enabled as boolean) ?? true,
    screenshotFrequencyMinutes: (row.screenshot_frequency_minutes as number) ?? 10,
    screenCaptureMode: (row.screen_capture_mode as AppSettings["screenCaptureMode"]) ?? "primary",
    screenshotBlur: (row.screenshot_blur as boolean) ?? false,
    blurAmount: (row.blur_amount as number) ?? 18,
    idleTimeoutMinutes: (row.idle_timeout_minutes as number) ?? 5,
    autoPauseOnIdle: (row.auto_pause_on_idle as boolean) ?? true,
    trackAppUsage: (row.track_app_usage as boolean) ?? true,
    excludedApps: (row.excluded_apps as string[]) ?? [],
    excludedDomains: (row.excluded_domains as string[]) ?? [],
    privateMode: (row.private_mode as boolean) ?? false,
    dataRetentionDays: (row.data_retention_days as number) ?? 180,
    encryptionEnabled: (row.encryption_enabled as boolean) ?? true,
    syncEnabled: (row.sync_enabled as boolean) ?? true,
    askBeforeCaptureSetup: (row.ask_before_capture_setup as boolean) ?? true,
    onboardingComplete: (row.onboarding_complete as boolean) ?? false,
  };
}

// ── Helpers ─────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data } = await db().auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

let activeWorkspaceId: string | null = null;

function fakeScreenshot(capturedAt: string): string {
  const h = 180;
  const w = 320;
  const time = new Date(capturedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#131A22"/><stop offset="1" stop-color="#1A232E"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect x="14" y="14" width="120" height="14" rx="7" fill="#263241"/>
    <rect x="14" y="42" width="${w - 28}" height="90" rx="8" fill="#131A22" opacity="0.85"/>
    <rect x="14" y="142" width="80" height="12" rx="6" fill="#263241"/>
    <text x="${w - 14}" y="${h - 10}" text-anchor="end" font-family="monospace" font-size="11" fill="#8A99AD">${time}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export async function uploadScreenshotBlob(workspaceId: string, userId: string, sessionId: string, shotId: string, dataUrl: string): Promise<string | null> {
  try {
    if (!supabase) return null;
    const blob = dataUrlToBlob(dataUrl);
    const path = `${workspaceId}/${userId}/${sessionId}/${shotId}.png`;
    let { error } = await supabase.storage.from("screebshots").upload(path, blob, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) {
      const res = await supabase.storage.from("screenshots").upload(path, blob, {
        contentType: "image/png",
        upsert: true,
      });
      error = res.error;
    }
    if (error) {
      console.warn("Supabase storage upload error:", error.message);
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

async function addAudit(type: AuditEvent["eventType"], detail: string, metadata: Record<string, unknown> | null = null) {
  try {
    const userId = await currentUserId();
    await db().from("audit_events").insert({
      id: uuidv4(),
      user_id: userId,
      event_type: type,
      detail,
      metadata,
    });
  } catch {
    // Audit failures are non-fatal
  }
}

// ── Default settings/workspace bootstrap ─────────────────────

async function ensureDefaultWorkspace(userId: string): Promise<Workspace> {
  try {
    const { data: existing } = await db()
      .from("workspaces")
      .select("*")
      .eq("owner_id", userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return toWorkspace(existing[0]);
    }

    // Check membership
    const { data: memberships } = await db()
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1);

    if (memberships && memberships.length > 0) {
      const { data: ws } = await db()
        .from("workspaces")
        .select("*")
        .eq("id", memberships[0].workspace_id)
        .single();
      if (ws) return toWorkspace(ws);
    }

    // Create a default workspace
    const wsId = uuidv4();
    const { data: newWs } = await db()
      .from("workspaces")
      .insert({
        id: wsId,
        name: "My Workspace",
        owner_id: userId,
      })
      .select()
      .single();

    if (newWs) {
      try {
        await db().from("workspace_members").insert({
          workspace_id: newWs.id,
          user_id: userId,
          role: "owner",
        });
      } catch {
        // Ignored
      }
      return toWorkspace(newWs);
    }
  } catch {
    // Fallback if table or RLS error
  }

  return {
    id: "w-default",
    name: "My Workspace",
    logoUrl: null,
    role: "owner",
    companyPolicy: {
      allowScreenshotDeletion: true,
      autoPauseOnIdle: true,
      requireManualNotes: false,
      screenshotFrequencyMinutes: 10,
    },
  };
}

async function ensureSettings(userId: string, workspaceId: string): Promise<AppSettings> {
  try {
    const { data: existing } = await db()
      .from("settings")
      .select("*")
      .eq("id", userId)
      .single();

    if (existing) return toSettings(existing);

    const { data: newSettings } = await db()
      .from("settings")
      .insert({ id: userId, workspace_id: workspaceId })
      .select()
      .single();

    if (newSettings) return toSettings(newSettings);
  } catch {
    // Fallback if settings query/insert fails
  }

  return {
    workspaceId: workspaceId || "w-default",
    screenCaptureEnabled: true,
    screenshotFrequencyMinutes: 10,
    screenCaptureMode: "primary",
    screenshotBlur: false,
    blurAmount: 18,
    idleTimeoutMinutes: 5,
    autoPauseOnIdle: true,
    trackAppUsage: true,
    excludedApps: [],
    excludedDomains: [],
    privateMode: false,
    dataRetentionDays: 180,
    encryptionEnabled: true,
    syncEnabled: true,
    askBeforeCaptureSetup: true,
    onboardingComplete: false,
  };
}

async function getOrInitActiveWorkspaceId(): Promise<string> {
  if (activeWorkspaceId) return activeWorkspaceId;
  const userId = await currentUserId();
  const ws = await ensureDefaultWorkspace(userId);
  activeWorkspaceId = ws.id;
  return activeWorkspaceId;
}

// ── Api implementation ──────────────────────────────────────

export const supabaseApi: Api = {
  name: "supabase",

  async login(req) {
    const signInRes = await db().auth.signInWithPassword({
      email: req.email,
      password: req.password,
    });

    let userObj = signInRes.data.user;

    // If account doesn't exist yet, automatically sign up in Supabase Auth
    if (signInRes.error && (signInRes.error.message.includes("Invalid login credentials") || signInRes.error.message.includes("User not found"))) {
      const signUpRes = await db().auth.signUp({
        email: req.email,
        password: req.password,
        options: {
          data: { name: req.email.split("@")[0] },
        },
      });

      if (signUpRes.error) {
        throw new Error(signUpRes.error.message);
      }
      userObj = signUpRes.data.user;
    } else if (signInRes.error) {
      throw new Error(signInRes.error.message);
    }

    if (!userObj) throw new Error("Login failed");
    const userId = userObj.id;

    // Load profile
    const { data: profile } = await db()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    const user = profile ? toUser(profile) : {
      id: userId,
      name: userObj.email?.split("@")[0] ?? "User",
      email: userObj.email ?? "",
      role: "member" as const,
      avatarUrl: null,
    };

    // Ensure workspace exists
    const workspace = await ensureDefaultWorkspace(userId);
    activeWorkspaceId = workspace.id;

    // Load all workspaces
    const { data: ownedWs } = await db().from("workspaces").select("*").eq("owner_id", userId);
    const { data: memberWsIds } = await db().from("workspace_members").select("workspace_id").eq("user_id", userId);
    const memberIds = (memberWsIds ?? []).map((m) => m.workspace_id as string);
    let memberWs: Record<string, unknown>[] = [];
    if (memberIds.length > 0) {
      const { data } = await db().from("workspaces").select("*").in("id", memberIds);
      memberWs = data ?? [];
    }

    const allWsMap = new Map<string, Workspace>();
    for (const ws of [...(ownedWs ?? []), ...memberWs]) {
      if (!allWsMap.has(ws.id as string)) {
        const mapped = toWorkspace(ws);
        // Set the user's role in this workspace
        const membership = (memberWsIds ?? []).find((m) => m.workspace_id === ws.id);
        if (ws.owner_id === userId) mapped.role = "owner";
        allWsMap.set(ws.id as string, mapped);
      }
    }
    const workspaces = [...allWsMap.values()];

    await addAudit("app_launched", `User ${user.name} signed in`, { email: user.email });

    return { user, workspaces };
  },

  async logout() {
    await db().auth.signOut();
    activeWorkspaceId = null;
  },

  async listWorkspaces() {
    const userId = await currentUserId();
    const { data: ownedWs } = await db().from("workspaces").select("*").eq("owner_id", userId);
    const { data: memberWsIds } = await db().from("workspace_members").select("workspace_id").eq("user_id", userId);
    const memberIds = (memberWsIds ?? []).map((m) => m.workspace_id as string);
    let memberWs: Record<string, unknown>[] = [];
    if (memberIds.length > 0) {
      const { data } = await db().from("workspaces").select("*").in("id", memberIds);
      memberWs = data ?? [];
    }
    const all = new Map<string, Workspace>();
    for (const ws of [...(ownedWs ?? []), ...memberWs]) {
      if (!all.has(ws.id as string)) all.set(ws.id as string, toWorkspace(ws));
    }
    return [...all.values()];
  },

  async selectWorkspace(workspaceId) {
    activeWorkspaceId = workspaceId;
    const userId = await currentUserId();
    const settings = await ensureSettings(userId, workspaceId);

    // Update settings workspace_id
    await db().from("settings").update({ workspace_id: workspaceId }).eq("id", userId);
    settings.workspaceId = workspaceId;

    return { settings };
  },

  async listProjects() {
    const wsId = await getOrInitActiveWorkspaceId();
    const { data, error } = await db()
      .from("projects")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toProject);
  },

  async listTasks(projectId) {
    const { data, error } = await db()
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toTask);
  },

  async createProject(name, client, color) {
    const wsId = await getOrInitActiveWorkspaceId();
    const { data, error } = await db()
      .from("projects")
      .insert({
        id: uuidv4(),
        workspace_id: activeWorkspaceId,
        name,
        client: client ?? null,
        color: color ?? "#4F8CFF",
        is_active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await addAudit("settings_changed", `Created project ${name}`);
    return toProject(data);
  },

  async createTask(projectId, name) {
    const { data, error } = await db()
      .from("tasks")
      .insert({ id: uuidv4(), project_id: projectId, name, is_active: true })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toTask(data);
  },

  async getActiveSession() {
    const userId = await currentUserId();
    const { data } = await db()
      .from("tracking_sessions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["running", "paused"])
      .order("started_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return null;
    return toSession(data[0]);
  },

  async recoverUnfinishedSession() {
    const userId = await currentUserId();
    const { data } = await db()
      .from("tracking_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending_recovery")
      .order("started_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return null;
    return toSession(data[0]);
  },

  async startTracking(req) {
    const userId = await currentUserId();
    const wsId = await getOrInitActiveWorkspaceId();

    const sessionId = uuidv4();
    const { data, error } = await db()
      .from("tracking_sessions")
      .insert({
        id: sessionId,
        workspace_id: wsId,
        user_id: userId,
        project_id: req.projectId,
        task_id: req.taskId,
        note: req.note,
        started_at: new Date().toISOString(),
        status: "running",
        total_active_seconds: 0,
        total_idle_seconds: 0,
        total_paused_seconds: 0,
        is_manual: false,
        is_private: false,
        sync_status: "synced",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await addAudit("session_started", "Tracking started", { sessionId });
    return toSession(data);
  },

  async pauseTracking(sessionId) {
    const { data, error } = await db()
      .from("tracking_sessions")
      .update({
        status: "paused",
        paused_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await addAudit("session_paused", "Tracking paused", { sessionId });
    return toSession(data);
  },

  async resumeTracking(sessionId) {
    // Calculate paused duration and add to total
    const { data: current } = await db()
      .from("tracking_sessions")
      .select("paused_at, total_paused_seconds")
      .eq("id", sessionId)
      .single();

    let additionalPaused = 0;
    if (current?.paused_at) {
      additionalPaused = Math.max(0, Math.floor((Date.now() - new Date(current.paused_at as string).getTime()) / 1000));
    }

    const { data, error } = await db()
      .from("tracking_sessions")
      .update({
        status: "running",
        paused_at: null,
        total_paused_seconds: ((current?.total_paused_seconds as number) ?? 0) + additionalPaused,
      })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await addAudit("session_resumed", "Tracking resumed", { sessionId });
    return toSession(data);
  },

  async stopTracking(sessionId) {
    const { data, error } = await db()
      .from("tracking_sessions")
      .update({
        status: "stopped",
        ended_at: new Date().toISOString(),
        paused_at: null,
      })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await addAudit("session_stopped", "Tracking stopped", { sessionId });
    return toSession(data);
  },

  async discardRecoveredSession(sessionId) {
    await db().from("tracking_sessions").delete().eq("id", sessionId);
  },

  async saveActivityBlock(sessionId, block) {
    const blockId = block.id ?? uuidv4();
    const row = {
      id: blockId,
      session_id: sessionId,
      started_at: block.startedAt,
      ended_at: block.endedAt,
      keyboard_count: block.keyboardCount ?? 0,
      mouse_click_count: block.mouseClickCount ?? 0,
      mouse_activity_score: block.mouseActivityScore ?? 0,
      active_seconds: block.activeSeconds ?? 0,
      idle_seconds: block.idleSeconds ?? 0,
      activity_percentage: block.activityPercentage ?? 0,
      sync_status: "synced",
    };

    const { data, error } = await db()
      .from("activity_blocks")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toBlock(data);
  },

  async saveAppUsage(sessionId, appUsage) {
    const { data, error } = await db()
      .from("app_usage_summaries")
      .insert({
        id: appUsage.id ?? uuidv4(),
        session_id: sessionId,
        app_name: appUsage.appName,
        duration_seconds: appUsage.durationSeconds ?? 0,
        sync_status: "synced",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toAppUsage(data);
  },

  async captureScreenshot(sessionId) {
    const userId = await currentUserId();
    const workspaceId = await getOrInitActiveWorkspaceId();
    const previewDataUrl = fakeScreenshot(new Date().toISOString());
    const shotId = uuidv4();

    // Upload to Supabase Storage bucket 'screenshots'
    const storagePath = await uploadScreenshotBlob(workspaceId, userId, sessionId, shotId, previewDataUrl);
    const uploadStatus: Screenshot["uploadStatus"] = storagePath ? "uploaded" : "pending";

    const shot: Screenshot = {
      id: shotId,
      sessionId,
      capturedAt: new Date().toISOString(),
      localPath: null,
      encryptedPath: storagePath,
      uploadStatus,
      screenNumber: 1,
      redactionApplied: false,
      previewDataUrl,
    };

    const { error } = await db().from("screenshots").insert({
      id: shot.id,
      session_id: sessionId,
      captured_at: shot.capturedAt,
      upload_status: shot.uploadStatus,
      screen_number: shot.screenNumber,
      redaction_applied: shot.redactionApplied,
      preview_data_url: shot.previewDataUrl,
    });
    if (error) throw new Error(error.message);

    await addAudit("screenshot_captured", `Screenshot captured (screen ${shot.screenNumber})`, { screenshotId: shot.id, storagePath });
    return { screenshot: shot, notificationShown: true };
  },

  async listScreenshots(filter) {
    let query = db().from("screenshots").select("*").order("captured_at", { ascending: false });

    if (filter?.date) {
      const dayStart = `${filter.date}T00:00:00`;
      const dayEnd = `${filter.date}T23:59:59`;
      query = query.gte("captured_at", dayStart).lte("captured_at", dayEnd);
    }
    if (filter?.uploadStatus) {
      query = query.eq("upload_status", filter.uploadStatus);
    }
    if (filter?.projectId) {
      // Get session IDs for this project
      const { data: sessions } = await db()
        .from("tracking_sessions")
        .select("id")
        .eq("project_id", filter.projectId);
      const ids = (sessions ?? []).map((s) => s.id as string);
      if (ids.length === 0) return [];
      query = query.in("session_id", ids);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toScreenshot);
  },

  async deleteScreenshot(screenshotId) {
    removePendingByEntityId("screenshots", screenshotId);
    await db().from("screenshots").update({ upload_status: "deleted" }).eq("id", screenshotId);
    await addAudit("screenshot_deleted", "Screenshot deleted", { screenshotId });
  },

  async getDashboard() {
    const userId = await currentUserId();
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = `${today}T00:00:00`;
    const dayEnd = `${today}T23:59:59`;

    const [sessionsRes, blocksRes, shotsRes, appUsageRes] = await Promise.all([
      db().from("tracking_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "stopped")
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd),
      db().from("activity_blocks")
        .select("*, tracking_sessions!inner(user_id)")
        .eq("tracking_sessions.user_id", userId)
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd)
        .order("started_at", { ascending: true }),
      db().from("screenshots")
        .select("*, tracking_sessions!inner(user_id)")
        .eq("tracking_sessions.user_id", userId)
        .neq("upload_status", "deleted")
        .gte("captured_at", dayStart)
        .lte("captured_at", dayEnd)
        .order("captured_at", { ascending: false })
        .limit(12),
      db().from("app_usage_summaries")
        .select("*, tracking_sessions!inner(user_id, started_at)")
        .eq("tracking_sessions.user_id", userId)
        .gte("tracking_sessions.started_at", dayStart)
        .lte("tracking_sessions.started_at", dayEnd),
    ]);

    const sessions = (sessionsRes.data ?? []).map(toSession);
    const blocks = (blocksRes.data ?? []).map(toBlock);
    const shots = (shotsRes.data ?? []).map(toScreenshot);
    const appUsage = (appUsageRes.data ?? []).map(toAppUsage);

    const totalActive = blocks.reduce((sum, b) => sum + b.activeSeconds, 0);
    const totalIdle = blocks.reduce((sum, b) => sum + b.idleSeconds, 0);
    const sessionActive = sessions.reduce((sum, s) => sum + s.totalActiveSeconds, 0);
    const totalSeconds = Math.max(totalActive + totalIdle, sessionActive);
    const activityPercentage = totalSeconds > 0 ? Math.round((Math.max(totalActive, sessionActive) / totalSeconds) * 100) : 0;

    return {
      todayTotalSeconds: totalSeconds,
      todayActiveSeconds: Math.max(totalActive, sessionActive),
      todayIdleSeconds: totalIdle,
      todayActivityPercentage: activityPercentage,
      todayScreenshotCount: shots.length,
      todayBlocks: blocks,
      todayScreenshots: shots,
      todayAppUsage: appUsage,
    } satisfies DashboardData;
  },

  async getWeek(startDate) {
    const userId = await currentUserId();
    const days: DaySummary[] = [];
    const start = new Date(startDate + "T00:00:00");

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59`;

      const [sessionsRes, blocksRes, manualRes, shotsRes] = await Promise.all([
        db().from("tracking_sessions")
          .select("*")
          .eq("user_id", userId)
          .eq("is_manual", false)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd),
        db().from("activity_blocks")
          .select("*, tracking_sessions!inner(user_id)")
          .eq("tracking_sessions.user_id", userId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd),
        db().from("manual_time_entries")
          .select("*")
          .eq("user_id", userId)
          .eq("date", dateStr),
        db().from("screenshots")
          .select("id, tracking_sessions!inner(user_id)")
          .eq("tracking_sessions.user_id", userId)
          .neq("upload_status", "deleted")
          .gte("captured_at", dayStart)
          .lte("captured_at", dayEnd),
      ]);

      const sessions = (sessionsRes.data ?? []).map(toSession);
      const blocks = (blocksRes.data ?? []).map(toBlock);
      const manual = (manualRes.data ?? []).map(toManualEntry);
      const screenshotCount = (shotsRes.data ?? []).length;

      const totalSeconds = blocks.reduce((sum, b) => sum + b.activeSeconds + b.idleSeconds, 0)
        + sessions.reduce((sum, s) => sum + s.totalActiveSeconds + s.totalIdleSeconds, 0);
      const activeSeconds = Math.max(
        blocks.reduce((sum, b) => sum + b.activeSeconds, 0),
        sessions.reduce((sum, s) => sum + s.totalActiveSeconds, 0),
      );
      const idleSeconds = blocks.reduce((sum, b) => sum + b.idleSeconds, 0);
      const manualSeconds = manual.reduce((sum, m) => sum + m.hours * 3600 + m.minutes * 60, 0);
      const activityPercentage = totalSeconds > 0 ? Math.round((activeSeconds / totalSeconds) * 100) : 0;

      // Project breakdown
      const projectBreakdown = new Map<string, { projectId: string; projectName: string; seconds: number; color: string }>();
      const projects = await this.listProjects();
      for (const s of sessions) {
        const p = projects.find((x) => x.id === s.projectId);
        if (!p) continue;
        const cur = projectBreakdown.get(p.id) ?? { projectId: p.id, projectName: p.name, seconds: 0, color: p.color };
        cur.seconds += s.totalActiveSeconds;
        projectBreakdown.set(p.id, cur);
      }
      for (const m of manual) {
        const p = projects.find((x) => x.id === m.projectId);
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
        screenshotCount,
        projectBreakdown: [...projectBreakdown.values()].sort((a, b) => b.seconds - a.seconds),
      });
    }

    return { startDate, days };
  },

  async listManualEntries() {
    const userId = await currentUserId();
    let query = db().from("manual_time_entries").select("*").eq("user_id", userId);
    if (activeWorkspaceId) {
      query = query.eq("workspace_id", activeWorkspaceId);
    }
    const { data, error } = await query.order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toManualEntry);
  },

  async addManualEntry(req) {
    const userId = await currentUserId();
    const wsId = await getOrInitActiveWorkspaceId();

    const { data, error } = await db()
      .from("manual_time_entries")
      .insert({
        id: uuidv4(),
        workspace_id: wsId,
        user_id: userId,
        project_id: req.projectId,
        task_id: req.taskId,
        date: req.date,
        hours: req.hours,
        minutes: req.minutes,
        note: req.note,
        is_billable: req.isBillable,
        sync_status: "synced",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toManualEntry(data);
  },

  async updateManualEntry(id, req) {
    const { data, error } = await db()
      .from("manual_time_entries")
      .update({
        project_id: req.projectId,
        task_id: req.taskId,
        date: req.date,
        hours: req.hours,
        minutes: req.minutes,
        note: req.note,
        is_billable: req.isBillable,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toManualEntry(data);
  },

  async deleteManualEntry(id) {
    const { error } = await db().from("manual_time_entries").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async getSettings() {
    const userId = await currentUserId();
    return ensureSettings(userId, activeWorkspaceId ?? "");
  },

  async updateSettings(patch) {
    const userId = await currentUserId();
    const current = await ensureSettings(userId, activeWorkspaceId ?? "");

    // Map camelCase patch to snake_case for Supabase
    const updates: Record<string, unknown> = {};
    if (patch.screenCaptureEnabled !== undefined) updates.screen_capture_enabled = patch.screenCaptureEnabled;
    if (patch.screenshotFrequencyMinutes !== undefined) updates.screenshot_frequency_minutes = patch.screenshotFrequencyMinutes;
    if (patch.screenCaptureMode !== undefined) updates.screen_capture_mode = patch.screenCaptureMode;
    if (patch.screenshotBlur !== undefined) updates.screenshot_blur = patch.screenshotBlur;
    if (patch.blurAmount !== undefined) updates.blur_amount = patch.blurAmount;
    if (patch.idleTimeoutMinutes !== undefined) updates.idle_timeout_minutes = patch.idleTimeoutMinutes;
    if (patch.autoPauseOnIdle !== undefined) updates.auto_pause_on_idle = patch.autoPauseOnIdle;
    if (patch.trackAppUsage !== undefined) updates.track_app_usage = patch.trackAppUsage;
    if (patch.excludedApps !== undefined) updates.excluded_apps = patch.excludedApps;
    if (patch.excludedDomains !== undefined) updates.excluded_domains = patch.excludedDomains;
    if (patch.privateMode !== undefined) updates.private_mode = patch.privateMode;
    if (patch.dataRetentionDays !== undefined) updates.data_retention_days = patch.dataRetentionDays;
    if (patch.encryptionEnabled !== undefined) updates.encryption_enabled = patch.encryptionEnabled;
    if (patch.syncEnabled !== undefined) updates.sync_enabled = patch.syncEnabled;
    if (patch.askBeforeCaptureSetup !== undefined) updates.ask_before_capture_setup = patch.askBeforeCaptureSetup;
    if (patch.onboardingComplete !== undefined) updates.onboarding_complete = patch.onboardingComplete;
    if (patch.workspaceId !== undefined) updates.workspace_id = patch.workspaceId;
    updates.updated_at = new Date().toISOString();

    if (patch.privateMode !== undefined && patch.privateMode !== current.privateMode) {
      await addAudit("private_mode_toggled", patch.privateMode ? "Private mode enabled" : "Private mode disabled");
    }

    const changed = Object.keys(patch);
    await addAudit("settings_changed", `Settings updated: ${changed.join(", ")}`, patch as Record<string, unknown>);

    const { data, error } = await db()
      .from("settings")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toSettings(data);
  },

  async syncNow() {
    // With Supabase, all data is already synced (written directly to the cloud).
    // This is a no-op but we update the state for UI consistency.
    return { flushed: 0 };
  },

  async getSyncState() {
    return {
      connected: true,
      mode: "online" as const,
      lastSyncAt: Date.now(),
      queueLength: 0,
      pendingCount: 0,
      failedCount: 0,
      syncing: false,
      usingMock: false,
    };
  },

  async getQueue() {
    // No local queue — Supabase is the source of truth.
    return [];
  },

  async listAuditEvents() {
    const userId = await currentUserId();
    const { data, error } = await db()
      .from("audit_events")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAuditEvent);
  },
};
