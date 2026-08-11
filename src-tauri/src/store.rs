// ─────────────────────────────────────────────────────────────
// Store: the single data-access layer over SQLite. All commands
// route through here. Sensitive columns are decrypted on read and
// encrypted on write via the Crypto layer.
// ─────────────────────────────────────────────────────────────

use std::sync::Mutex;
use uuid::Uuid;

use rusqlite::{params, Connection, OptionalExtension};

use crate::crypto::Crypto;
use crate::error::{AppError, Result};
use crate::models::*;

pub struct Store {
    pub conn: Mutex<Connection>,
    pub crypto: Crypto,
}

impl Store {
    pub fn new(conn: Connection, crypto: Crypto) -> Self {
        Self {
            conn: Mutex::new(conn),
            crypto,
        }
    }

    // ── settings ───────────────────────────────────────────

    pub fn get_settings(&self) -> Result<AppSettings> {
        let conn = self.conn.lock().unwrap();
        get_settings_inner(&conn)
    }

    pub fn update_settings(&self, patch: &serde_json::Value) -> Result<AppSettings> {
        let conn = self.conn.lock().unwrap();
        let mut next = get_settings_inner(&conn)?;
        apply_patch(&mut next, patch);

        conn.execute(
            "UPDATE settings SET workspace_id=?, screen_capture_enabled=?, screenshot_frequency_minutes=?,
             screen_capture_mode=?, screenshot_blur=?, blur_amount=?, idle_timeout_minutes=?,
             auto_pause_on_idle=?, track_app_usage=?, excluded_apps=?, excluded_domains=?,
             private_mode=?, data_retention_days=?, encryption_enabled=?, sync_enabled=?,
             ask_before_capture_setup=?, onboarding_complete=? WHERE id=1",
            params![
                next.workspace_id,
                next.screen_capture_enabled,
                next.screenshot_frequency_minutes,
                next.screen_capture_mode,
                next.screenshot_blur,
                next.blur_amount,
                next.idle_timeout_minutes,
                next.auto_pause_on_idle,
                next.track_app_usage,
                serde_json::to_string(&next.excluded_apps)?,
                serde_json::to_string(&next.excluded_domains)?,
                next.private_mode,
                next.data_retention_days,
                next.encryption_enabled,
                next.sync_enabled,
                next.ask_before_capture_setup,
                next.onboarding_complete,
            ],
        )?;
        Ok(next)
    }

    // ── auth / workspaces ──────────────────────────────────

    pub fn login(&self, email: &str) -> Result<(User, Vec<Workspace>)> {
        let conn = self.conn.lock().unwrap();
        let user = conn
            .query_row(
                "SELECT id, name, email, role, avatar_url FROM users WHERE lower(email) = lower(?1)",
                params![email],
                row_to_user,
            )
            .optional()?;
        match user {
            Some(u) => {
                let workspaces = list_workspaces_inner(&conn)?;
                Ok((u, workspaces))
            }
            None => Err(AppError::NotFound("user".into())),
        }
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>> {
        let conn = self.conn.lock().unwrap();
        list_workspaces_inner(&conn)
    }

    pub fn get_user(&self, id: &str) -> Result<Option<User>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, name, email, role, avatar_url FROM users WHERE id=?1",
            params![id],
            row_to_user,
        )
        .optional()
        .map_err(Into::into)
    }

    // ── projects / tasks ───────────────────────────────────

    pub fn list_projects(&self, workspace_id: &str) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, client, color, is_active FROM projects
             WHERE workspace_id=?1 AND is_active=1 ORDER BY name",
        )?;
        let rows = stmt.query_map(params![workspace_id], |r| {
            Ok(Project {
                id: r.get(0)?,
                workspace_id: r.get(1)?,
                name: r.get(2)?,
                client: r.get(3)?,
                color: r.get(4)?,
                is_active: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn create_project(&self, workspace_id: &str, name: &str, client: Option<&str>, color: Option<&str>) -> Result<Project> {
        let id = Uuid::new_v4().to_string();
        let color = color.unwrap_or("#4F8CFF");
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, name, client, color, is_active) VALUES (?1,?2,?3,?4,?5,1)",
            params![id, workspace_id, name, client, color],
        )?;
        Ok(Project {
            id,
            workspace_id: workspace_id.into(),
            name: name.into(),
            client: client.map(String::from),
            color: color.into(),
            is_active: true,
        })
    }

    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, name, is_active FROM tasks WHERE project_id=?1 AND is_active=1 ORDER BY name",
        )?;
        let rows = stmt.query_map(params![project_id], |r| {
            Ok(Task {
                id: r.get(0)?,
                project_id: r.get(1)?,
                name: r.get(2)?,
                is_active: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn create_task(&self, project_id: &str, name: &str) -> Result<Task> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, name, is_active) VALUES (?1,?2,?3,1)",
            params![id, project_id, name],
        )?;
        Ok(Task {
            id,
            project_id: project_id.into(),
            name: name.into(),
            is_active: true,
        })
    }

    // ── sessions ───────────────────────────────────────────

    pub fn get_active_session(&self) -> Result<Option<TrackingSession>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT * FROM tracking_sessions WHERE status IN ('running','paused') LIMIT 1",
            [],
            |r| row_to_session(r, &self.crypto),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn get_recovered_session(&self) -> Result<Option<TrackingSession>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT * FROM tracking_sessions WHERE status = 'pending_recovery' LIMIT 1",
            [],
            |r| row_to_session(r, &self.crypto),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn get_session(&self, id: &str) -> Result<Option<TrackingSession>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT * FROM tracking_sessions WHERE id = ?1",
            params![id],
            |r| row_to_session(r, &self.crypto),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn start_session(&self, user: &User, workspace_id: &str, req: &StartTrackingRequest, private_mode: bool) -> Result<TrackingSession> {
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let note_enc = match &req.note {
            Some(n) => Some(self.crypto.encrypt_str(n)?),
            None => None,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tracking_sessions
             (id, workspace_id, user_id, project_id, task_id, note_enc, started_at, status, is_private, sync_status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,'running',?8,'pending')",
            params![id, workspace_id, user.id, req.project_id, req.task_id, note_enc, now, private_mode],
        )?;
        drop(conn);
        self.get_session(&id)?.ok_or_else(|| AppError::InvalidState("session insert failed".into()))
    }

    pub fn update_session(&self, session: &TrackingSession) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let note_enc = match &session.note {
            Some(n) => Some(self.crypto.encrypt_str(n)?),
            None => None,
        };
        conn.execute(
            "UPDATE tracking_sessions SET task_id=?, note_enc=?, ended_at=?, paused_at=?, status=?,
             total_active_seconds=?, total_idle_seconds=?, total_paused_seconds=?, is_private=?,
             sync_status=? WHERE id=?",
            params![
                session.task_id,
                note_enc,
                session.ended_at,
                session.paused_at,
                session.status,
                session.total_active_seconds,
                session.total_idle_seconds,
                session.total_paused_seconds,
                session.is_private,
                session.sync_status,
                session.id,
            ],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tracking_sessions WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn mark_sessions_recovered(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tracking_sessions SET status='pending_recovery', ended_at=COALESCE(ended_at, ?1)
             WHERE status IN ('running','paused')",
            params![now_iso()],
        )?;
        Ok(())
    }

    // ── activity blocks ────────────────────────────────────

    pub fn save_activity_block(&self, session_id: &str, input: &ActivityBlockInput) -> Result<ActivityBlock> {
        let id = input.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO activity_blocks
             (id, session_id, started_at, ended_at, keyboard_count, mouse_click_count,
              mouse_activity_score, active_seconds, idle_seconds, activity_percentage, sync_status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'pending')",
            params![
                id, session_id, input.started_at, input.ended_at, input.keyboard_count,
                input.mouse_click_count, input.mouse_activity_score, input.active_seconds,
                input.idle_seconds, input.activity_percentage,
            ],
        )?;
        Ok(ActivityBlock {
            id,
            session_id: session_id.into(),
            started_at: input.started_at.clone(),
            ended_at: input.ended_at.clone(),
            keyboard_count: input.keyboard_count,
            mouse_click_count: input.mouse_click_count,
            mouse_activity_score: input.mouse_activity_score,
            active_seconds: input.active_seconds,
            idle_seconds: input.idle_seconds,
            activity_percentage: input.activity_percentage,
            sync_status: "pending".into(),
        })
    }

    pub fn list_blocks(&self, date: &str) -> Result<Vec<ActivityBlock>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM activity_blocks WHERE substr(started_at,1,10)=?1 ORDER BY started_at",
        )?;
        let rows = stmt.query_map(params![date], |r| {
            Ok(ActivityBlock {
                id: r.get(0)?,
                session_id: r.get(1)?,
                started_at: r.get(2)?,
                ended_at: r.get(3)?,
                keyboard_count: r.get(4)?,
                mouse_click_count: r.get(5)?,
                mouse_activity_score: r.get(6)?,
                active_seconds: r.get(7)?,
                idle_seconds: r.get(8)?,
                activity_percentage: r.get(9)?,
                sync_status: r.get(10)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn list_blocks_between(&self, from_iso: &str, to_iso: &str) -> Result<Vec<ActivityBlock>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM activity_blocks WHERE started_at >= ?1 AND started_at < ?2 ORDER BY started_at",
        )?;
        let rows = stmt.query_map(params![from_iso, to_iso], block_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    // ── screenshots ────────────────────────────────────────

    pub fn insert_screenshot(&self, shot: &Screenshot) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO screenshots
             (id, session_id, captured_at, local_path, encrypted_path, upload_status, screen_number, redaction_applied, preview_data_url, deleted)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0)",
            params![
                shot.id, shot.session_id, shot.captured_at, shot.local_path, shot.encrypted_path,
                shot.upload_status, shot.screen_number, shot.redaction_applied, shot.preview_data_url,
            ],
        )?;
        Ok(())
    }

    pub fn list_screenshots(&self, date: Option<&str>, project_id: Option<&str>, upload_status: Option<&str>) -> Result<Vec<Screenshot>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from(
            "SELECT s.id, s.session_id, s.captured_at, s.local_path, s.encrypted_path, s.upload_status, s.screen_number, s.redaction_applied, s.preview_data_url
             FROM screenshots s WHERE s.deleted = 0",
        );
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(d) = date {
            sql.push_str(" AND substr(s.captured_at,1,10)=?");
            args.push(Box::new(d.to_string()));
        }
        if let Some(p) = project_id {
            sql.push_str(" AND s.session_id IN (SELECT id FROM tracking_sessions WHERE project_id=?)");
            args.push(Box::new(p.to_string()));
        }
        if let Some(u) = upload_status {
            sql.push_str(" AND s.upload_status=?");
            args.push(Box::new(u.to_string()));
        }
        sql.push_str(" ORDER BY s.captured_at DESC");

        let mut stmt = conn.prepare(&sql)?;
        let params_ref: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let rows = stmt.query_map(params_ref.as_slice(), |r| {
            Ok(Screenshot {
                id: r.get(0)?,
                session_id: r.get(1)?,
                captured_at: r.get(2)?,
                local_path: r.get(3)?,
                encrypted_path: r.get(4)?,
                upload_status: r.get(5)?,
                screen_number: r.get(6)?,
                redaction_applied: r.get(7)?,
                preview_data_url: r.get(8)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn mark_screenshot_deleted(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE screenshots SET deleted=1, upload_status='deleted' WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn get_screenshot(&self, id: &str) -> Result<Option<Screenshot>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, session_id, captured_at, local_path, encrypted_path, upload_status, screen_number, redaction_applied, preview_data_url
             FROM screenshots WHERE id=?1 AND deleted=0",
            params![id],
            |r| {
                Ok(Screenshot {
                    id: r.get(0)?,
                    session_id: r.get(1)?,
                    captured_at: r.get(2)?,
                    local_path: r.get(3)?,
                    encrypted_path: r.get(4)?,
                    upload_status: r.get(5)?,
                    screen_number: r.get(6)?,
                    redaction_applied: r.get(7)?,
                    preview_data_url: r.get(8)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    // ── app usage ──────────────────────────────────────────

    pub fn save_app_usage(&self, session_id: &str, input: &AppUsageInput) -> Result<AppUsageSummary> {
        let id = input.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO app_usage_summaries (id, session_id, app_name, duration_seconds, sync_status)
             VALUES (?1,?2,?3,?4,'pending')",
            params![id, session_id, input.app_name, input.duration_seconds],
        )?;
        Ok(AppUsageSummary {
            id,
            session_id: session_id.into(),
            app_name: input.app_name.clone(),
            duration_seconds: input.duration_seconds,
            sync_status: "pending".into(),
        })
    }

    pub fn list_app_usage_for_sessions(&self, session_ids: &[String]) -> Result<Vec<AppUsageSummary>> {
        if session_ids.is_empty() {
            return Ok(vec![]);
        }
        let conn = self.conn.lock().unwrap();
        let placeholders = vec!["?"; session_ids.len()].join(",");
        let sql = format!(
            "SELECT id, session_id, app_name, duration_seconds, sync_status FROM app_usage_summaries WHERE session_id IN ({placeholders})"
        );
        let mut stmt = conn.prepare(&sql)?;
        let params_ref: Vec<&dyn rusqlite::ToSql> = session_ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(params_ref.as_slice(), |r| {
            Ok(AppUsageSummary {
                id: r.get(0)?,
                session_id: r.get(1)?,
                app_name: r.get(2)?,
                duration_seconds: r.get(3)?,
                sync_status: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    // ── manual entries ─────────────────────────────────────

    pub fn list_manual_entries(&self, workspace_id: &str) -> Result<Vec<ManualTimeEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, user_id, project_id, task_id, date, hours, minutes, note, is_billable, sync_status
             FROM manual_time_entries WHERE workspace_id=?1 ORDER BY date DESC",
        )?;
        let rows = stmt.query_map(params![workspace_id], |r| {
            Ok(ManualTimeEntry {
                id: r.get(0)?,
                workspace_id: r.get(1)?,
                user_id: r.get(2)?,
                project_id: r.get(3)?,
                task_id: r.get(4)?,
                date: r.get(5)?,
                hours: r.get(6)?,
                minutes: r.get(7)?,
                note: r.get(8)?,
                is_billable: r.get(9)?,
                sync_status: r.get(10)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn add_manual_entry(&self, user: &User, workspace_id: &str, req: &ManualEntryRequest) -> Result<ManualTimeEntry> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO manual_time_entries (id, workspace_id, user_id, project_id, task_id, date, hours, minutes, note, is_billable, sync_status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'pending')",
            params![id, workspace_id, user.id, req.project_id, req.task_id, req.date, req.hours, req.minutes, req.note, req.is_billable],
        )?;
        Ok(ManualTimeEntry {
            id,
            workspace_id: workspace_id.into(),
            user_id: user.id.clone(),
            project_id: req.project_id.clone(),
            task_id: req.task_id.clone(),
            date: req.date.clone(),
            hours: req.hours,
            minutes: req.minutes,
            note: req.note.clone(),
            is_billable: req.is_billable,
            sync_status: "pending".into(),
        })
    }

    pub fn update_manual_entry(&self, id: &str, req: &ManualEntryRequest) -> Result<ManualTimeEntry> {
        let conn = self.conn.lock().unwrap();
        let entry: ManualTimeEntry = {
            let row = conn
                .query_row(
                    "SELECT workspace_id, user_id FROM manual_time_entries WHERE id=?1",
                    params![id],
                    |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
                )
                .optional()?;
            match row {
                Some((workspace_id, user_id)) => ManualTimeEntry {
                    id: id.into(),
                    workspace_id,
                    user_id,
                    project_id: req.project_id.clone(),
                    task_id: req.task_id.clone(),
                    date: req.date.clone(),
                    hours: req.hours,
                    minutes: req.minutes,
                    note: req.note.clone(),
                    is_billable: req.is_billable,
                    sync_status: "pending".into(),
                },
                None => return Err(AppError::NotFound("manual entry".into())),
            }
        };
        conn.execute(
            "UPDATE manual_time_entries SET project_id=?, task_id=?, date=?, hours=?, minutes=?, note=?, is_billable=?, sync_status='pending' WHERE id=?",
            params![req.project_id, req.task_id, req.date, req.hours, req.minutes, req.note, req.is_billable, id],
        )?;
        Ok(entry)
    }

    pub fn delete_manual_entry(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM manual_time_entries WHERE id=?1", params![id])?;
        Ok(())
    }

    // ── audit ──────────────────────────────────────────────

    pub fn audit(&self, event_type: &str, detail: &str, metadata: Option<serde_json::Value>) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO audit_events (id, timestamp, event_type, detail, metadata) VALUES (?1,?2,?3,?4,?5)",
            params![id, now_iso(), event_type, detail, metadata.map(|m| m.to_string())],
        )?;
        Ok(())
    }

    pub fn list_audit_events(&self, limit: i64) -> Result<Vec<AuditEvent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, event_type, detail, metadata FROM audit_events ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |r| {
            let metadata: Option<String> = r.get(4)?;
            Ok(AuditEvent {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                event_type: r.get(2)?,
                detail: r.get(3)?,
                metadata: metadata.and_then(|m| serde_json::from_str(&m).ok()),
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    // ── sync queue ─────────────────────────────────────────

    pub fn enqueue(&self, entity_type: &str, entity_id: &str, operation: &str, payload: &serde_json::Value) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, status, attempts, next_retry_at, created_at)
             VALUES (?1,?2,?3,?4,?5,'pending',0,0,?6)",
            params![id, entity_type, entity_id, operation, payload.to_string(), now_unix_ms()],
        )?;
        Ok(())
    }

    /// Replace a pending item for the same entity+operation so we never
    /// enqueue stale creates/updates on top of a newer one.
    pub fn replace_if_pending(&self, entity_type: &str, entity_id: &str, operation: &str, payload: &serde_json::Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let updated = conn.execute(
            "UPDATE sync_queue SET operation=?1, payload=?2, attempts=0, next_retry_at=0, last_error=NULL
             WHERE entity_type=?3 AND entity_id=?4 AND status='pending'",
            params![operation, payload.to_string(), entity_type, entity_id],
        )?;
        if updated == 0 {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, status, attempts, next_retry_at, created_at)
                 VALUES (?1,?2,?3,?4,?5,'pending',0,0,?6)",
                params![id, entity_type, entity_id, operation, payload.to_string(), now_unix_ms()],
            )?;
        }
        Ok(())
    }

    pub fn list_queue(&self) -> Result<Vec<SyncQueueItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, entity_type, entity_id, operation, payload, status, attempts, next_retry_at, last_error, created_at
             FROM sync_queue ORDER BY created_at DESC LIMIT 200",
        )?;
        let rows = stmt.query_map([], |r| {
            let payload: String = r.get(4)?;
            Ok(SyncQueueItem {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                operation: r.get(3)?,
                payload: serde_json::from_str(&payload).unwrap_or(serde_json::json!({})),
                status: r.get(5)?,
                attempts: r.get(6)?,
                next_retry_at: r.get(7)?,
                last_error: r.get(8)?,
                created_at: r.get(9)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn queue_stats(&self) -> Result<(i64, i64, i64, Option<i64>)> {
        let conn = self.conn.lock().unwrap();
        let queue_length: i64 = conn.query_row("SELECT COUNT(*) FROM sync_queue", [], |r| r.get(0))?;
        let pending: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status='pending'",
            [],
            |r| r.get(0),
        )?;
        let failed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status IN ('failed','retry')",
            [],
            |r| r.get(0),
        )?;
        let last_sync: Option<i64> = conn
            .query_row(
                "SELECT MAX(created_at) FROM sync_queue WHERE status='synced'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok((queue_length, pending, failed, last_sync))
    }

    /// Simulated flush: mark every pending item as synced. A real backend
    /// replaces this body; the command surface stays identical.
    pub fn flush_queue(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let flushed = conn.execute(
            "UPDATE sync_queue SET status='synced', last_error=NULL WHERE status IN ('pending','retry')",
            [],
        )? as i64;
        Ok(flushed)
    }

    // ── aggregates ─────────────────────────────────────────

    pub fn dashboard(&self, today: &str) -> Result<DashboardData> {
        let blocks = self.list_blocks(today)?;
        let shots = self.list_screenshots(Some(today), None, None)?;

        let conn = self.conn.lock().unwrap();
        let today_sessions: Vec<TrackingSession> = {
            let mut stmt = conn.prepare(
                "SELECT * FROM tracking_sessions WHERE substr(started_at,1,10)=?1 AND is_manual=0",
            )?;
            let rows = stmt.query_map(params![today], |r| row_to_session(r, &self.crypto))?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        drop(conn);

        let active_from_sessions: i64 = today_sessions.iter().map(|s| s.total_active_seconds).sum();
        let idle_from_sessions: i64 = today_sessions.iter().map(|s| s.total_idle_seconds).sum();
        let active_from_blocks: i64 = blocks.iter().map(|b| b.active_seconds).sum();
        let idle_from_blocks: i64 = blocks.iter().map(|b| b.idle_seconds).sum();

        let total_active = active_from_blocks.max(active_from_sessions);
        let total_idle = idle_from_blocks.max(idle_from_sessions);
        let total_seconds = total_active + total_idle;
        let activity_percentage = if total_seconds > 0 {
            ((total_active as f64 / total_seconds as f64) * 100.0).round() as i64
        } else {
            0
        };

        let session_ids: Vec<String> = today_sessions.iter().map(|s| s.id.clone()).collect();
        let app_usage = self.list_app_usage_for_sessions(&session_ids)?;

        Ok(DashboardData {
            today_total_seconds: total_seconds,
            today_active_seconds: total_active,
            today_idle_seconds: total_idle,
            today_activity_percentage: activity_percentage,
            today_screenshot_count: shots.len() as i64,
            today_blocks: blocks,
            today_screenshots: shots,
            today_app_usage: app_usage,
        })
    }

    pub fn week(&self, start_date: &str) -> Result<WeekData> {
        let conn = self.conn.lock().unwrap();
        let mut days = Vec::with_capacity(7);
        for offset in 0..7 {
            let date = add_days(start_date, offset)?;
            let next = add_days(&date, 1)?;
            let blocks = {
                let mut stmt = conn.prepare(
                    "SELECT * FROM activity_blocks WHERE started_at >= ?1 AND started_at < ?2",
                )?;
                let rows = stmt.query_map(params![format!("{date}T00:00:00"), format!("{next}T00:00:00")], block_from_row)?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };
            let sessions: Vec<(TrackingSession, i64)> = {
                let mut stmt = conn.prepare(
                    "SELECT * FROM tracking_sessions WHERE started_at >= ?1 AND started_at < ?2 AND is_manual=0",
                )?;
                let rows = stmt.query_map(
                    params![format!("{date}T00:00:00"), format!("{next}T00:00:00")],
                    |r| {
                        let s = row_to_session(r, &self.crypto)?;
                        let s_shots: i64 = conn.query_row(
                            "SELECT COUNT(*) FROM screenshots WHERE session_id=?1 AND deleted=0",
                            params![s.id],
                            |r2| r2.get(0),
                        )?;
                        Ok((s, s_shots))
                    },
                )?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };
            let manual = {
                let mut stmt = conn.prepare(
                    "SELECT * FROM manual_time_entries WHERE date=?1",
                )?;
                let rows = stmt.query_map(params![date], |r| {
                    Ok(ManualTimeEntry {
                        id: r.get(0)?,
                        workspace_id: r.get(1)?,
                        user_id: r.get(2)?,
                        project_id: r.get(3)?,
                        task_id: r.get(4)?,
                        date: r.get(5)?,
                        hours: r.get(6)?,
                        minutes: r.get(7)?,
                        note: r.get(8)?,
                        is_billable: r.get(9)?,
                        sync_status: r.get(10)?,
                    })
                })?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };

            let block_active: i64 = blocks.iter().map(|b| b.active_seconds).sum();
            let block_idle: i64 = blocks.iter().map(|b| b.idle_seconds).sum();
            let session_active: i64 = sessions.iter().map(|(s, _)| s.total_active_seconds).sum();
            let session_idle: i64 = sessions.iter().map(|(s, _)| s.total_idle_seconds).sum();
            let manual_seconds: i64 = manual.iter().map(|m| m.hours * 3600 + m.minutes * 60).sum();

            let total_active = block_active.max(session_active);
            let total_idle = block_idle.max(session_idle);
            let total_seconds = total_active + total_idle + manual_seconds;
            let activity = if total_active + total_idle > 0 {
                ((total_active as f64 / (total_active + total_idle) as f64) * 100.0).round() as i64
            } else {
                0
            };

            let mut breakdown: std::collections::HashMap<String, (String, i64, String)> = std::collections::HashMap::new();
            for (s, _) in &sessions {
                if let Some(p) = conn
                    .query_row(
                        "SELECT name, color FROM projects WHERE id=?1",
                        params![s.project_id],
                        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
                    )
                    .optional()?
                {
                    let entry = breakdown.entry(s.project_id.clone()).or_insert((p.0.clone(), 0, p.1.clone()));
                    entry.1 += s.total_active_seconds;
                }
            }
            for m in &manual {
                if let Some(p) = conn
                    .query_row(
                        "SELECT name, color FROM projects WHERE id=?1",
                        params![m.project_id],
                        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
                    )
                    .optional()?
                {
                    let entry = breakdown.entry(m.project_id.clone()).or_insert((p.0.clone(), 0, p.1.clone()));
                    entry.1 += m.hours * 3600 + m.minutes * 60;
                }
            }
            let mut project_breakdown: Vec<ProjectSummary> = breakdown
                .into_iter()
                .map(|(pid, (name, secs, color))| ProjectSummary {
                    project_id: pid,
                    project_name: name,
                    seconds: secs,
                    color,
                })
                .collect();
            project_breakdown.sort_by(|a, b| b.seconds.cmp(&a.seconds));

            let screenshot_count: i64 = sessions.iter().map(|(_, c)| c).sum();

            days.push(DaySummary {
                date,
                total_seconds,
                active_seconds: total_active,
                idle_seconds: total_idle,
                manual_seconds,
                activity_percentage: activity,
                screenshot_count,
                project_breakdown,
            });
        }
        Ok(WeekData {
            start_date: start_date.into(),
            days,
        })
    }
}

// ── row mappers & helpers ────────────────────────────────────

fn get_settings_inner(conn: &Connection) -> Result<AppSettings> {
    let row = conn
        .query_row(
            "SELECT workspace_id, screen_capture_enabled, screenshot_frequency_minutes,
                    screen_capture_mode, screenshot_blur, blur_amount, idle_timeout_minutes,
                    auto_pause_on_idle, track_app_usage, excluded_apps, excluded_domains,
                    private_mode, data_retention_days, encryption_enabled, sync_enabled,
                    ask_before_capture_setup, onboarding_complete
             FROM settings WHERE id = 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, bool>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, bool>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, bool>(7)?,
                    r.get::<_, bool>(8)?,
                    r.get::<_, String>(9)?,
                    r.get::<_, String>(10)?,
                    r.get::<_, bool>(11)?,
                    r.get::<_, i64>(12)?,
                    r.get::<_, bool>(13)?,
                    r.get::<_, bool>(14)?,
                    r.get::<_, bool>(15)?,
                    r.get::<_, bool>(16)?,
                ))
            },
        )
        .optional()?;
    match row {
        Some(x) => Ok(AppSettings {
            workspace_id: x.0,
            screen_capture_enabled: x.1,
            screenshot_frequency_minutes: x.2,
            screen_capture_mode: x.3,
            screenshot_blur: x.4,
            blur_amount: x.5,
            idle_timeout_minutes: x.6,
            auto_pause_on_idle: x.7,
            track_app_usage: x.8,
            excluded_apps: serde_json::from_str(&x.9).unwrap_or_default(),
            excluded_domains: serde_json::from_str(&x.10).unwrap_or_default(),
            private_mode: x.11,
            data_retention_days: x.12,
            encryption_enabled: x.13,
            sync_enabled: x.14,
            ask_before_capture_setup: x.15,
            onboarding_complete: x.16,
        }),
        None => Err(AppError::NotFound("settings".into())),
    }
}

fn row_to_user(r: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: r.get(0)?,
        name: r.get(1)?,
        email: r.get(2)?,
        role: r.get(3)?,
        avatar_url: r.get(4)?,
    })
}

fn row_to_session(r: &rusqlite::Row, crypto: &Crypto) -> rusqlite::Result<TrackingSession> {
    let note_enc: Option<String> = r.get(5)?;
    let note = match note_enc {
        Some(enc) => crypto.decrypt_str(&enc).ok(),
        None => None,
    };
    Ok(TrackingSession {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        user_id: r.get(2)?,
        project_id: r.get(3)?,
        task_id: r.get(4)?,
        note,
        started_at: r.get(6)?,
        ended_at: r.get(7)?,
        paused_at: r.get(8)?,
        status: r.get(9)?,
        total_active_seconds: r.get(10)?,
        total_idle_seconds: r.get(11)?,
        total_paused_seconds: r.get(12)?,
        is_manual: r.get(13)?,
        is_private: r.get(14)?,
        sync_status: r.get(15)?,
        sync_error: r.get(16)?,
    })
}

fn block_from_row(r: &rusqlite::Row) -> rusqlite::Result<ActivityBlock> {
    Ok(ActivityBlock {
        id: r.get(0)?,
        session_id: r.get(1)?,
        started_at: r.get(2)?,
        ended_at: r.get(3)?,
        keyboard_count: r.get(4)?,
        mouse_click_count: r.get(5)?,
        mouse_activity_score: r.get(6)?,
        active_seconds: r.get(7)?,
        idle_seconds: r.get(8)?,
        activity_percentage: r.get(9)?,
        sync_status: r.get(10)?,
    })
}

fn list_workspaces_inner(conn: &Connection) -> Result<Vec<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, logo_url, role, allow_screenshot_deletion, auto_pause_on_idle, require_manual_notes, screenshot_frequency_minutes
         FROM workspaces ORDER BY name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Workspace {
            id: r.get(0)?,
            name: r.get(1)?,
            logo_url: r.get(2)?,
            role: r.get(3)?,
            company_policy: CompanyPolicy {
                allow_screenshot_deletion: r.get(4)?,
                auto_pause_on_idle: r.get(5)?,
                require_manual_notes: r.get(6)?,
                screenshot_frequency_minutes: r.get(7)?,
            },
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

fn apply_patch(settings: &mut AppSettings, patch: &serde_json::Value) {
    macro_rules! bool_field {
        ($field:ident, $key:expr) => {
            if let Some(v) = patch.get($key).and_then(|x| x.as_bool()) {
                settings.$field = v;
            }
        };
    }
    macro_rules! int_field {
        ($field:ident, $key:expr) => {
            if let Some(v) = patch.get($key).and_then(|x| x.as_i64()) {
                settings.$field = v;
            }
        };
    }
    macro_rules! str_field {
        ($field:ident, $key:expr) => {
            if let Some(v) = patch.get($key).and_then(|x| x.as_str()) {
                settings.$field = v.to_string();
            }
        };
    }

    str_field!(workspace_id, "workspaceId");
    bool_field!(screen_capture_enabled, "screenCaptureEnabled");
    int_field!(screenshot_frequency_minutes, "screenshotFrequencyMinutes");
    str_field!(screen_capture_mode, "screenCaptureMode");
    bool_field!(screenshot_blur, "screenshotBlur");
    int_field!(blur_amount, "blurAmount");
    int_field!(idle_timeout_minutes, "idleTimeoutMinutes");
    bool_field!(auto_pause_on_idle, "autoPauseOnIdle");
    bool_field!(track_app_usage, "trackAppUsage");
    if let Some(v) = patch.get("excludedApps").and_then(|x| x.as_array()) {
        settings.excluded_apps = v.iter().filter_map(|i| i.as_str().map(String::from)).collect();
    }
    if let Some(v) = patch.get("excludedDomains").and_then(|x| x.as_array()) {
        settings.excluded_domains = v.iter().filter_map(|i| i.as_str().map(String::from)).collect();
    }
    bool_field!(private_mode, "privateMode");
    int_field!(data_retention_days, "dataRetentionDays");
    bool_field!(encryption_enabled, "encryptionEnabled");
    bool_field!(sync_enabled, "syncEnabled");
    bool_field!(ask_before_capture_setup, "askBeforeCaptureSetup");
    bool_field!(onboarding_complete, "onboardingComplete");
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn now_unix_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn add_days(iso_date: &str, offset: i64) -> Result<String> {
    let date = chrono::NaiveDate::parse_from_str(iso_date, "%Y-%m-%d")
        .map_err(|e| AppError::Other(format!("invalid date {iso_date}: {e}")))?;
    let next = date + chrono::Duration::days(offset);
    Ok(next.format("%Y-%m-%d").to_string())
}

// ── tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, seed};

    fn test_store() -> Store {
        let dir = tempfile::tempdir().unwrap();
        let conn = db::open(&dir.path().join("test.db")).unwrap();
        db::init_settings_row(&conn).unwrap();
        let crypto = Crypto::load_or_create(dir.path()).unwrap();
        let store = Store::new(conn, crypto);
        seed::seed_if_empty(&store).unwrap();
        store
    }

    #[test]
    fn seed_creates_demo_data() {
        let store = test_store();
        let (user, workspaces) = store.login("alex@acme.test").unwrap();
        assert_eq!(user.email, "alex@acme.test");
        assert_eq!(workspaces.len(), 2);
        assert!(store.list_projects("w-1").unwrap().len() >= 3);
        let settings = store.get_settings().unwrap();
        assert_eq!(settings.workspace_id, "w-1");
    }

    #[test]
    fn seed_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let conn = db::open(&dir.path().join("test.db")).unwrap();
        let crypto = Crypto::load_or_create(dir.path()).unwrap();
        let store = Store::new(conn, crypto);
        seed::seed_if_empty(&store).unwrap();
        seed::seed_if_empty(&store).unwrap();
        assert_eq!(store.login("alex@acme.test").unwrap().1.len(), 2);
    }

    #[test]
    fn session_lifecycle() {
        let store = test_store();
        let (user, _) = store.login("alex@acme.test").unwrap();
        let req = StartTrackingRequest {
            project_id: "p-1".into(),
            task_id: Some("t-1".into()),
            note: Some("test note".into()),
        };
        let session = store.start_session(&user, "w-1", &req, false).unwrap();
        assert_eq!(session.status, "running");
        assert_eq!(session.note.as_deref(), Some("test note"));
        assert_eq!(store.get_active_session().unwrap().unwrap().id, session.id);
    }

    #[test]
    fn settings_patch_roundtrip() {
        let store = test_store();
        let updated = store
            .update_settings(&serde_json::json!({ "privateMode": true, "screenshotFrequencyMinutes": 15 }))
            .unwrap();
        assert!(updated.private_mode);
        assert_eq!(updated.screenshot_frequency_minutes, 15);
    }

    #[test]
    fn queue_enqueue_and_replace() {
        let store = test_store();
        store
            .enqueue("activity_blocks", "x", "create", &serde_json::json!({ "id": "x" }))
            .unwrap();
        store
            .replace_if_pending("activity_blocks", "x", "update", &serde_json::json!({ "id": "x", "v": 2 }))
            .unwrap();
        let items = store.list_queue().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].operation, "update");
        assert_eq!(store.flush_queue().unwrap(), 1);
        assert_eq!(store.queue_stats().unwrap().0, 1);
    }

    #[test]
    fn dashboard_aggregates_today() {
        let store = test_store();
        let date = store.conn.lock().unwrap()
            .query_row("SELECT substr(started_at, 1, 10) FROM tracking_sessions ORDER BY started_at DESC LIMIT 1", [], |r| r.get::<_, String>(0))
            .unwrap_or_else(|_| chrono::Utc::now().format("%Y-%m-%d").to_string());
        let d = store.dashboard(&date).unwrap();
        assert!(d.today_total_seconds > 0);
        assert!(!d.today_blocks.is_empty());
    }

    #[test]
    fn audit_trail_is_written() {
        let store = test_store();
        store.audit("settings_changed", "toggled private mode", None).unwrap();
        let events = store.list_audit_events(10).unwrap();
        assert!(events.iter().any(|e| e.event_type == "settings_changed"));
    }
}
