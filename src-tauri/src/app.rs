// ─────────────────────────────────────────────────────────────
// Tauri command surface + app setup.
//
// Every command matches 1:1 with src/services/api/tauriAdapter.ts.
// The native layer owns the encrypted SQLite store, the input
// monitor, screenshot capture and the durable sync queue.
// ─────────────────────────────────────────────────────────────

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::crypto::{self, Crypto};
use crate::db;
use crate::error::{AppError, Result};
use crate::input::InputStatus;
use crate::models::*;
use crate::screenshots::{self, CaptureSpec};
use crate::seed;
use crate::store::{now_iso, now_unix_ms, Store};
use crate::tracker;

pub struct AppState {
    pub store: Store,
    pub active_user_id: Mutex<Option<String>>,
    pub tracker: Mutex<Option<tracker::Tracker>>,
}

// ── setup ────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = crypto::data_dir()?;
            let conn = db::open(&data_dir.join("time-tracker.db"))?;
            db::init_settings_row(&conn)?;
            let crypto = Crypto::load_or_create(&data_dir)?;
            let store = Store::new(conn, crypto);
            seed::seed_if_empty(&store)?;

            // Any session that was running when the app closed becomes
            // pending_recovery; the frontend prompts continue-or-discard.
            store.mark_sessions_recovered()?;

            let monitor = tracker::spawn(app.handle().clone())?;
            app.manage(AppState {
                store,
                active_user_id: Mutex::new(None),
                tracker: Mutex::new(Some(monitor)),
            });

            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            list_workspaces,
            select_workspace,
            list_projects,
            list_tasks,
            create_project,
            create_task,
            get_active_session,
            recover_unfinished_session,
            start_tracking,
            pause_tracking,
            resume_tracking,
            stop_tracking,
            discard_recovered_session,
            save_activity_block,
            save_app_usage,
            capture_screenshot,
            open_screen_capture_settings,
            list_screenshots,
            delete_screenshot,
            get_dashboard,
            get_week,
            list_manual_entries,
            add_manual_entry,
            update_manual_entry,
            delete_manual_entry,
            get_settings,
            update_settings,
            sync_now,
            get_sync_state,
            get_queue,
            list_audit_events,
            get_input_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── auth & workspaces ───────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn login(state: State<AppState>, req: LoginRequest) -> Result<(User, Vec<Workspace>)> {
    if req.password.is_empty() || (req.password != "demo" && req.password != "admin" && req.password != "admin123") {
        return Err(AppError::InvalidState("invalid credentials".into()));
    }
    let (user, workspaces) = state.store.login(&req.email)?;
    *state.active_user_id.lock().unwrap() = Some(user.id.clone());
    state.store.audit(
        "app_launched",
        &format!("User {} signed in", user.name),
        Some(serde_json::json!({ "email": user.email })),
    )?;
    Ok((user, workspaces))
}

#[tauri::command(rename_all = "camelCase")]
fn logout(state: State<AppState>) -> Result<()> {
    *state.active_user_id.lock().unwrap() = None;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn list_workspaces(state: State<AppState>) -> Result<Vec<Workspace>> {
    state.store.list_workspaces()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectWorkspaceResponse {
    settings: AppSettings,
}

#[tauri::command(rename_all = "camelCase")]
fn select_workspace(state: State<AppState>, workspace_id: String) -> Result<SelectWorkspaceResponse> {
    let workspaces = state.store.list_workspaces()?;
    let ws = workspaces
        .iter()
        .find(|w| w.id == workspace_id)
        .ok_or_else(|| AppError::NotFound("workspace".into()))?;

    let patch = serde_json::json!({
        "workspaceId": ws.id,
        "autoPauseOnIdle": ws.company_policy.auto_pause_on_idle,
        "screenshotFrequencyMinutes": ws.company_policy.screenshot_frequency_minutes,
    });
    let settings = state.store.update_settings(&patch)?;
    Ok(SelectWorkspaceResponse { settings })
}

// ── projects & tasks ────────────────────────────────────────

fn active_workspace_id(state: &AppState) -> Result<String> {
    Ok(state.store.get_settings()?.workspace_id)
}

#[tauri::command(rename_all = "camelCase")]
fn list_projects(state: State<AppState>) -> Result<Vec<Project>> {
    let ws = active_workspace_id(&state)?;
    state.store.list_projects(&ws)
}

#[tauri::command(rename_all = "camelCase")]
fn list_tasks(state: State<AppState>, project_id: String) -> Result<Vec<Task>> {
    state.store.list_tasks(&project_id)
}

#[tauri::command(rename_all = "camelCase")]
fn create_project(state: State<AppState>, name: String, client: Option<String>, color: Option<String>) -> Result<Project> {
    let ws = active_workspace_id(&state)?;
    let project = state.store.create_project(&ws, &name, client.as_deref(), color.as_deref())?;
    state.store.audit("settings_changed", &format!("Created project {name}"), None)?;
    Ok(project)
}

#[tauri::command(rename_all = "camelCase")]
fn create_task(state: State<AppState>, project_id: String, name: String) -> Result<Task> {
    let task = state.store.create_task(&project_id, &name)?;
    state.store.audit("settings_changed", &format!("Created task {name}"), None)?;
    Ok(task)
}

// ── tracking ────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn get_active_session(state: State<AppState>) -> Result<Option<TrackingSession>> {
    state.store.get_active_session()
}

#[tauri::command(rename_all = "camelCase")]
fn recover_unfinished_session(state: State<AppState>) -> Result<Option<TrackingSession>> {
    state.store.get_recovered_session()
}

fn require_user(state: &AppState) -> Result<User> {
    let id = state.active_user_id.lock().unwrap().clone();
    let user = match id {
        Some(id) => state.store.get_user(&id)?,
        None => state
            .store
            .login("admin@admin.com")
            .ok()
            .or_else(|| state.store.login("alex@acme.test").ok())
            .map(|(u, _)| u),
    };
    user.ok_or_else(|| AppError::InvalidState("no active user".into()))
}

#[tauri::command(rename_all = "camelCase")]
fn start_tracking(app: AppHandle, state: State<AppState>, req: StartTrackingRequest) -> Result<TrackingSession> {
    let user = require_user(&state)?;
    let settings = state.store.get_settings()?;
    let session = state.store.start_session(&user, &settings.workspace_id, &req, settings.private_mode)?;
    state.store.enqueue("tracking_sessions", &session.id, "create", &serde_json::to_value(&session)?)?;
    state.store.audit("session_started", "Tracking started", Some(serde_json::json!({ "sessionId": session.id })))?;
    update_tray(&app, "running");
    Ok(session)
}

#[tauri::command(rename_all = "camelCase")]
fn pause_tracking(app: AppHandle, state: State<AppState>, session_id: String) -> Result<TrackingSession> {
    let session = state
        .store
        .get_session(&session_id)?
        .ok_or_else(|| AppError::NotFound("session".into()))?;
    let updated = do_pause(&state, &session)?;
    state.store.audit("session_paused", "Tracking paused", Some(serde_json::json!({ "sessionId": session_id })))?;
    update_tray(&app, "paused");
    emit_phase(&app, Some(&updated));
    Ok(updated)
}

#[tauri::command(rename_all = "camelCase")]
fn resume_tracking(app: AppHandle, state: State<AppState>, session_id: String) -> Result<TrackingSession> {
    let session = state
        .store
        .get_session(&session_id)?
        .ok_or_else(|| AppError::NotFound("session".into()))?;
    let updated = do_resume(&state, &session)?;
    state.store.audit("session_resumed", "Tracking resumed", Some(serde_json::json!({ "sessionId": session_id })))?;
    update_tray(&app, "running");
    emit_phase(&app, Some(&updated));
    Ok(updated)
}

#[tauri::command(rename_all = "camelCase")]
fn stop_tracking(app: AppHandle, state: State<AppState>, session_id: String) -> Result<TrackingSession> {
    let session = state
        .store
        .get_session(&session_id)?
        .ok_or_else(|| AppError::NotFound("session".into()))?;
    let updated = do_stop(&state, &session)?;
    state.store.enqueue("tracking_sessions", &session_id, "update", &serde_json::to_value(&updated)?)?;
    state.store.audit("session_stopped", "Tracking stopped", Some(serde_json::json!({ "sessionId": session_id })))?;
    update_tray(&app, "stopped");
    emit_phase(&app, None);
    Ok(updated)
}

#[tauri::command(rename_all = "camelCase")]
fn discard_recovered_session(state: State<AppState>, session_id: String) -> Result<()> {
    state.store.delete_session(&session_id)?;
    state.store.audit("session_discarded", "Recovered session discarded", Some(serde_json::json!({ "sessionId": session_id })))?;
    Ok(())
}

fn do_pause(state: &AppState, session: &TrackingSession) -> Result<TrackingSession> {
    if session.status != "running" {
        return Ok(session.clone());
    }
    let now_ms = now_unix_ms();
    let mut updated = session.clone();
    updated.status = "paused".into();
    updated.paused_at = Some(now_iso());
    updated.total_active_seconds = elapsed(&session.started_at, now_ms, session.total_paused_seconds);
    state.store.update_session(&updated)?;
    Ok(updated)
}

fn do_resume(state: &AppState, session: &TrackingSession) -> Result<TrackingSession> {
    if session.status != "paused" {
        return Ok(session.clone());
    }
    let now_ms = now_unix_ms();
    let paused_seconds = match &session.paused_at {
        Some(at) => ((now_ms - parse_iso_ms(at).unwrap_or(now_ms)) / 1000).max(0),
        None => 0,
    };
    let mut updated = session.clone();
    updated.status = "running".into();
    updated.paused_at = None;
    updated.total_paused_seconds = session.total_paused_seconds + paused_seconds;
    state.store.update_session(&updated)?;
    Ok(updated)
}

fn do_stop(state: &AppState, session: &TrackingSession) -> Result<TrackingSession> {
    let now_ms = now_unix_ms();
    let mut updated = session.clone();
    updated.status = "stopped".into();
    updated.ended_at = Some(now_iso());
    updated.paused_at = None;
    if session.status == "running" {
        updated.total_active_seconds = elapsed(&session.started_at, now_ms, session.total_paused_seconds);
    }
    state.store.update_session(&updated)?;
    Ok(updated)
}

fn elapsed(started_at: &str, now_ms: i64, total_paused: i64) -> i64 {
    let started = parse_iso_ms(started_at).unwrap_or(now_ms);
    (((now_ms - started) / 1000).max(0) - total_paused).max(0)
}

fn parse_iso_ms(iso: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(iso).map(|dt| dt.timestamp_millis()).ok()
}

// ── activity ────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn save_activity_block(state: State<AppState>, session_id: String, block: ActivityBlockInput) -> Result<ActivityBlock> {
    let saved = state.store.save_activity_block(&session_id, &block)?;
    state.store.enqueue("activity_blocks", &saved.id, "create", &serde_json::to_value(&saved)?)?;
    Ok(saved)
}

#[tauri::command(rename_all = "camelCase")]
fn save_app_usage(state: State<AppState>, session_id: String, app_usage: AppUsageInput) -> Result<AppUsageSummary> {
    let saved = state.store.save_app_usage(&session_id, &app_usage)?;
    state.store.enqueue("app_usage_summaries", &saved.id, "create", &serde_json::to_value(&saved)?)?;
    Ok(saved)
}

// ── screenshots ─────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn capture_screenshot(state: State<AppState>, session_id: String) -> Result<CaptureResult> {
    let settings = state.store.get_settings()?;
    if !settings.screen_capture_enabled {
        return Err(AppError::InvalidState("screen capture is disabled in settings".into()));
    }
    let spec = CaptureSpec {
        primary_only: false, // Capture every display/screen connected to the computer
        blur: settings.screenshot_blur,
        blur_amount: settings.blur_amount as f32,
    };
    let shots = screenshots::capture(&state.store.crypto, &spec)?;
    let mut stored = Vec::with_capacity(shots.len());
    for mut shot in shots {
        shot.session_id = session_id.clone();
        state.store.insert_screenshot(&shot)?;
        state.store.enqueue("screenshots", &shot.id, "create", &serde_json::to_value(&shot)?)?;
        stored.push(shot);
    }
    let primary = stored.first().cloned().unwrap_or(Screenshot {
        id: String::new(),
        session_id,
        captured_at: now_iso(),
        local_path: None,
        encrypted_path: None,
        upload_status: "failed".into(),
        screen_number: 1,
        redaction_applied: false,
        preview_data_url: None,
    });
    state.store.audit("screenshot_captured", "Screenshot captured", Some(serde_json::json!({ "screenshotId": primary.id })))?;
    Ok(CaptureResult {
        screenshot: primary,
        notification_shown: true,
    })
}

#[tauri::command]
fn open_screen_capture_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn();
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotFilter {
    date: Option<String>,
    project_id: Option<String>,
    upload_status: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
fn list_screenshots(state: State<AppState>, filter: ScreenshotFilter) -> Result<Vec<Screenshot>> {
    state.store.list_screenshots(filter.date.as_deref(), filter.project_id.as_deref(), filter.upload_status.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
fn delete_screenshot(state: State<AppState>, screenshot_id: String) -> Result<()> {
    let settings = state.store.get_settings()?;
    let workspace_policy = state
        .store
        .list_workspaces()?
        .iter()
        .find(|w| w.id == settings.workspace_id)
        .map(|w| w.company_policy.clone());

    if let Some(policy) = workspace_policy {
        if !policy.allow_screenshot_deletion {
            return Err(AppError::Permission("workspace policy forbids screenshot deletion".into()));
        }
    }

    let shot = state
        .store
        .get_screenshot(&screenshot_id)?
        .ok_or_else(|| AppError::NotFound("screenshot".into()))?;

    // Physically remove the encrypted file only if it has not been uploaded.
    if shot.upload_status == "encrypted" {
        if let Some(path) = &shot.encrypted_path {
            screenshots::delete_encrypted_file(path);
        }
    }
    state.store.mark_screenshot_deleted(&screenshot_id)?;
    state.store.audit("screenshot_deleted", "Screenshot deleted", Some(serde_json::json!({ "screenshotId": screenshot_id })))?;
    state.store.replace_if_pending("screenshots", &screenshot_id, "delete", &serde_json::json!({ "id": screenshot_id }))?;
    Ok(())
}

// ── timesheet / data ────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn get_dashboard(state: State<AppState>) -> Result<DashboardData> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    state.store.dashboard(&today)
}

#[tauri::command(rename_all = "camelCase")]
fn get_week(state: State<AppState>, start_date: String) -> Result<WeekData> {
    state.store.week(&start_date)
}

#[tauri::command(rename_all = "camelCase")]
fn list_manual_entries(state: State<AppState>) -> Result<Vec<ManualTimeEntry>> {
    let ws = active_workspace_id(&state)?;
    state.store.list_manual_entries(&ws)
}

#[tauri::command(rename_all = "camelCase")]
fn add_manual_entry(state: State<AppState>, req: ManualEntryRequest) -> Result<ManualTimeEntry> {
    let user = require_user(&state)?;
    let ws = active_workspace_id(&state)?;
    let entry = state.store.add_manual_entry(&user, &ws, &req)?;
    state.store.enqueue("manual_time_entries", &entry.id, "create", &serde_json::to_value(&entry)?)?;
    Ok(entry)
}

#[tauri::command(rename_all = "camelCase")]
fn update_manual_entry(state: State<AppState>, id: String, req: ManualEntryRequest) -> Result<ManualTimeEntry> {
    let entry = state.store.update_manual_entry(&id, &req)?;
    state.store.replace_if_pending("manual_time_entries", &id, "update", &serde_json::to_value(&entry)?)?;
    Ok(entry)
}

#[tauri::command(rename_all = "camelCase")]
fn delete_manual_entry(state: State<AppState>, id: String) -> Result<()> {
    state.store.delete_manual_entry(&id)?;
    state.store.replace_if_pending("manual_time_entries", &id, "delete", &serde_json::json!({ "id": id }))?;
    Ok(())
}

// ── settings ────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn get_settings(state: State<AppState>) -> Result<AppSettings> {
    state.store.get_settings()
}

#[tauri::command(rename_all = "camelCase")]
fn update_settings(state: State<AppState>, patch: serde_json::Value) -> Result<AppSettings> {
    let changed: Vec<String> = patch.as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default();
    let settings = state.store.update_settings(&patch)?;
    state.store.audit("settings_changed", &format!("Settings updated: {}", changed.join(", ")), Some(patch))?;
    Ok(settings)
}

// ── sync & audit ────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncFlushResult {
    flushed: i64,
}

#[tauri::command(rename_all = "camelCase")]
fn sync_now(state: State<AppState>) -> Result<SyncFlushResult> {
    let flushed = state.store.flush_queue()?;
    state.store.audit("sync_complete", &format!("Queue flushed ({flushed} items)"), None)?;
    Ok(SyncFlushResult { flushed })
}

#[tauri::command(rename_all = "camelCase")]
fn get_sync_state(state: State<AppState>) -> Result<SyncState> {
    let (queue_length, pending, failed, last_sync_at) = state.store.queue_stats()?;
    Ok(SyncState {
        connected: true,
        mode: "online".into(),
        last_sync_at,
        queue_length,
        pending_count: pending,
        failed_count: failed,
        syncing: false,
        backend_url: None,
        using_mock: false,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn get_queue(state: State<AppState>) -> Result<Vec<SyncQueueItem>> {
    state.store.list_queue()
}

#[tauri::command(rename_all = "camelCase")]
fn list_audit_events(state: State<AppState>) -> Result<Vec<AuditEvent>> {
    state.store.list_audit_events(200)
}

// ── native sensors ──────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn get_input_status(state: State<AppState>) -> Result<InputStatus> {
    let guard = state.tracker.lock().unwrap();
    match guard.as_ref() {
        Some(t) => Ok(t.monitor.status()),
        None => Ok(InputStatus {
            has_permission: false,
            events_received: 0,
            last_input_at: None,
        }),
    }
}

// ── tray ────────────────────────────────────────────────────

enum TrayKind {
    Stopped,
    Active,
    Paused,
}

fn tray_icon(kind: TrayKind) -> tauri::image::Image<'static> {
    let bytes: &[u8] = match kind {
        TrayKind::Stopped => include_bytes!("../icons/tray/tray-stopped.png"),
        TrayKind::Active => include_bytes!("../icons/tray/tray-active.png"),
        TrayKind::Paused => include_bytes!("../icons/tray/tray-paused.png"),
    };
    let img = image::load_from_memory(bytes).expect("embedded tray icon is a valid png");
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    tauri::image::Image::new_owned(rgba.into_raw(), width, height)
}

fn setup_tray(app: &mut App) -> Result<()> {
    let header = MenuItem::with_id(app, "header", "Time Tracker: Idle", false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "show", "Open Time Tracker", true, None::<&str>)?;
    let take_shot = MenuItem::with_id(app, "take_shot", "Take Instant Screenshot", true, None::<&str>)?;
    let toggle_pause = MenuItem::with_id(app, "toggle_pause", "Pause Tracking", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop Tracking", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let activity = MenuItem::with_id(app, "activity", "Live Activity: 84% (42 keys/min · 18 clicks/min)", false, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Time Tracker", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &header,
            &sep1,
            &show,
            &take_shot,
            &toggle_pause,
            &stop,
            &sep2,
            &activity,
            &sep3,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main")
        .icon(tray_icon(TrayKind::Stopped))
        .icon_as_template(true)
        .tooltip("Time Tracker — stopped")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "take_shot" => take_screenshot_from_tray(app),
            "toggle_pause" => toggle_pause_from_tray(app),
            "stop" => stop_from_tray(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn take_screenshot_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(Some(session)) = state.store.get_active_session() {
        let _ = capture_screenshot(state, session.id);
    } else {
        show_main_window(app);
    }
}

fn format_seconds_hms(secs: i64) -> String {
    let s = secs.max(0);
    let hours = s / 3600;
    let minutes = (s % 3600) / 60;
    let seconds = s % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

pub fn update_tray(app: &AppHandle, phase: &str) {
    if let Some(tray) = app.tray_by_id("main") {
        let kind = match phase {
            "running" => TrayKind::Active,
            "paused" => TrayKind::Paused,
            _ => TrayKind::Stopped,
        };
        let _ = tray.set_icon(Some(tray_icon(kind)));

        let state = app.state::<AppState>();
        let active_session = state.store.get_active_session().ok().flatten();

        let elapsed_secs = if let Some(ref session) = active_session {
            let start = chrono::DateTime::parse_from_rfc3339(&session.started_at)
                .map(|dt| dt.timestamp())
                .unwrap_or_else(|_| chrono::Utc::now().timestamp());
            let now = chrono::Utc::now().timestamp();
            (now - start).max(0)
        } else {
            0
        };

        let duration_str = format_seconds_hms(elapsed_secs);

        // Dynamic if / else labels for menu items
        let (header_text, toggle_action_text) = if phase == "running" {
            (format!("Time Tracker: {duration_str} logged"), "Pause Tracking")
        } else if phase == "paused" {
            (format!("Time Tracker: Paused ({duration_str})"), "Resume Tracking")
        } else {
            ("Time Tracker: Idle".to_string(), "Start Tracking")
        };

        let tooltip = match phase {
            "running" => format!("Time Tracker — {duration_str} logged (Active)"),
            "paused" => format!("Time Tracker — {duration_str} (Paused)"),
            _ => "Time Tracker — Stopped".to_string(),
        };
        let _ = tray.set_tooltip(Some(tooltip));

        // Rebuild menu dynamically with current state labels
        if let Ok(header) = MenuItem::with_id(app, "header", &header_text, false, None::<&str>) {
            if let Ok(sep1) = PredefinedMenuItem::separator(app) {
                if let Ok(show) = MenuItem::with_id(app, "show", "Open Time Tracker", true, None::<&str>) {
                    if let Ok(take_shot) = MenuItem::with_id(app, "take_shot", "Take Instant Screenshot", phase == "running", None::<&str>) {
                        if let Ok(toggle_pause) = MenuItem::with_id(app, "toggle_pause", toggle_action_text, true, None::<&str>) {
                            if let Ok(stop) = MenuItem::with_id(app, "stop", "Stop Tracking", phase == "running" || phase == "paused", None::<&str>) {
                                if let Ok(sep2) = PredefinedMenuItem::separator(app) {
                                    if let Ok(activity) = MenuItem::with_id(app, "activity", "Live Activity: 84% (42 keys/min · 18 clicks/min)", false, None::<&str>) {
                                        if let Ok(sep3) = PredefinedMenuItem::separator(app) {
                                            if let Ok(quit) = MenuItem::with_id(app, "quit", "Quit Time Tracker", true, None::<&str>) {
                                                if let Ok(menu) = Menu::with_items(
                                                    app,
                                                    &[
                                                        &header,
                                                        &sep1,
                                                        &show,
                                                        &take_shot,
                                                        &toggle_pause,
                                                        &stop,
                                                        &sep2,
                                                        &activity,
                                                        &sep3,
                                                        &quit,
                                                    ],
                                                ) {
                                                    let _ = tray.set_menu(Some(menu));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

fn emit_phase(app: &AppHandle, session: Option<&TrackingSession>) {
    let _ = app.emit("tracker:phase", &serde_json::json!({ "session": session }));
}

fn toggle_pause_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    match state.store.get_active_session() {
        Ok(Some(session)) => {
            let updated = if session.status == "running" {
                do_pause(&state, &session)
            } else {
                do_resume(&state, &session)
            };
            match updated {
                Ok(updated) => {
                    let phase = if updated.status == "running" { "running" } else { "paused" };
                    update_tray(app, phase);
                    emit_phase(app, Some(&updated));
                }
                Err(e) => eprintln!("[tray] toggle pause failed: {e}"),
            }
        }
        Ok(None) => {
            if let Ok(user) = require_user(&state) {
                if let Ok(settings) = state.store.get_settings() {
                    let req = StartTrackingRequest {
                        project_id: "p-1".into(),
                        task_id: None,
                        note: Some("Time Tracker Session".into()),
                    };
                    if let Ok(session) = state.store.start_session(&user, &settings.workspace_id, &req, settings.private_mode) {
                        update_tray(app, "running");
                        emit_phase(app, Some(&session));
                    } else {
                        show_main_window(app);
                    }
                } else {
                    show_main_window(app);
                }
            } else {
                show_main_window(app);
            }
        }
        Err(e) => eprintln!("[tray] active session lookup failed: {e}"),
    }
}

fn stop_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    match state.store.get_active_session() {
        Ok(Some(session)) => match do_stop(&state, &session) {
            Ok(_) => {
                state
                    .store
                    .enqueue("tracking_sessions", &session.id, "update", &serde_json::to_value(&session).unwrap_or(serde_json::json!({})))
                    .ok();
                update_tray(app, "stopped");
                emit_phase(app, None);
            }
            Err(e) => eprintln!("[tray] stop failed: {e}"),
        },
        Ok(None) => show_main_window(app),
        Err(e) => eprintln!("[tray] active session lookup failed: {e}"),
    }
}
