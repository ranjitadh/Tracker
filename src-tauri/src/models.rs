// ─────────────────────────────────────────────────────────────
// Domain models mirroring src/types/index.ts. Serde uses camelCase
// so payloads match the frontend + future REST API exactly.
// ─────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyPolicy {
    pub allow_screenshot_deletion: bool,
    pub auto_pause_on_idle: bool,
    pub require_manual_notes: bool,
    pub screenshot_frequency_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub logo_url: Option<String>,
    pub role: String,
    pub company_policy: CompanyPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub client: Option<String>,
    pub color: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingSession {
    pub id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub note: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub paused_at: Option<String>,
    pub status: String, // running | paused | stopped | pending_recovery
    pub total_active_seconds: i64,
    pub total_idle_seconds: i64,
    pub total_paused_seconds: i64,
    pub is_manual: bool,
    pub is_private: bool,
    pub sync_status: String,
    pub sync_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBlock {
    pub id: String,
    pub session_id: String,
    pub started_at: String,
    pub ended_at: String,
    pub keyboard_count: i64,
    pub mouse_click_count: i64,
    pub mouse_activity_score: i64,
    pub active_seconds: i64,
    pub idle_seconds: i64,
    pub activity_percentage: i64,
    pub sync_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub id: String,
    pub session_id: String,
    pub captured_at: String,
    pub local_path: Option<String>,
    pub encrypted_path: Option<String>,
    pub upload_status: String,
    pub screen_number: i64,
    pub redaction_applied: bool,
    pub preview_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsageSummary {
    pub id: String,
    pub session_id: String,
    pub app_name: String,
    pub duration_seconds: i64,
    pub sync_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualTimeEntry {
    pub id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub date: String,
    pub hours: i64,
    pub minutes: i64,
    pub note: Option<String>,
    pub is_billable: bool,
    pub sync_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub timestamp: String,
    pub event_type: String,
    pub detail: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub workspace_id: String,
    pub screen_capture_enabled: bool,
    pub screenshot_frequency_minutes: i64,
    pub screen_capture_mode: String,
    pub screenshot_blur: bool,
    pub blur_amount: i64,
    pub idle_timeout_minutes: i64,
    pub auto_pause_on_idle: bool,
    pub track_app_usage: bool,
    pub excluded_apps: Vec<String>,
    pub excluded_domains: Vec<String>,
    pub private_mode: bool,
    pub data_retention_days: i64,
    pub encryption_enabled: bool,
    pub sync_enabled: bool,
    pub ask_before_capture_setup: bool,
    pub onboarding_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub date: String,
    pub total_seconds: i64,
    pub active_seconds: i64,
    pub idle_seconds: i64,
    pub manual_seconds: i64,
    pub activity_percentage: i64,
    pub screenshot_count: i64,
    pub project_breakdown: Vec<ProjectSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub project_id: String,
    pub project_name: String,
    pub seconds: i64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekData {
    pub start_date: String,
    pub days: Vec<DaySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub today_total_seconds: i64,
    pub today_active_seconds: i64,
    pub today_idle_seconds: i64,
    pub today_activity_percentage: i64,
    pub today_screenshot_count: i64,
    pub today_blocks: Vec<ActivityBlock>,
    pub today_screenshots: Vec<Screenshot>,
    pub today_app_usage: Vec<AppUsageSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncQueueItem {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: serde_json::Value,
    pub status: String,
    pub attempts: i64,
    pub next_retry_at: i64,
    pub last_error: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub connected: bool,
    pub mode: String,
    pub last_sync_at: Option<i64>,
    pub queue_length: i64,
    pub pending_count: i64,
    pub failed_count: i64,
    pub syncing: bool,
    pub backend_url: Option<String>,
    pub using_mock: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub screenshot: Screenshot,
    pub notification_shown: bool,
}

// ── request payloads ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTrackingRequest {
    pub project_id: String,
    pub task_id: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualEntryRequest {
    pub project_id: String,
    pub task_id: Option<String>,
    pub date: String,
    pub hours: i64,
    pub minutes: i64,
    pub note: Option<String>,
    pub is_billable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBlockInput {
    pub id: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub keyboard_count: i64,
    pub mouse_click_count: i64,
    pub mouse_activity_score: i64,
    pub active_seconds: i64,
    pub idle_seconds: i64,
    pub activity_percentage: i64,
    pub sync_status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsageInput {
    pub id: Option<String>,
    pub app_name: String,
    pub duration_seconds: i64,
    pub sync_status: Option<String>,
}
