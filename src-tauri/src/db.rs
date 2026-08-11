// ─────────────────────────────────────────────────────────────
// Local SQLite store.
//
// The database file lives under the app data directory. Sensitive
// columns (notes, auth fields) are encrypted with the AES-GCM
// layer at the application boundary; screenshots are stored as
// fully-encrypted files and only paths + metadata live here.
//
// The file itself is additionally protected by OS user permissions
// (0600 on Unix). This gives encrypted-at-rest storage without
// weakening queryability.
// ─────────────────────────────────────────────────────────────

use rusqlite::{Connection, OpenFlags};
use std::path::Path;

use crate::error::Result;

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI,
    )?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn configure(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

pub fn migrate(conn: &Connection) -> Result<()> {
    let tx = conn.unchecked_transaction()?;

    tx.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'member',
            avatar_url TEXT
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            logo_url TEXT,
            role TEXT NOT NULL DEFAULT 'member',
            allow_screenshot_deletion INTEGER NOT NULL DEFAULT 1,
            auto_pause_on_idle INTEGER NOT NULL DEFAULT 1,
            require_manual_notes INTEGER NOT NULL DEFAULT 0,
            screenshot_frequency_minutes INTEGER NOT NULL DEFAULT 10
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            client TEXT,
            color TEXT NOT NULL DEFAULT '#4F8CFF',
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS tracking_sessions (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            task_id TEXT,
            note_enc TEXT,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            paused_at TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            total_active_seconds INTEGER NOT NULL DEFAULT 0,
            total_idle_seconds INTEGER NOT NULL DEFAULT 0,
            total_paused_seconds INTEGER NOT NULL DEFAULT 0,
            is_manual INTEGER NOT NULL DEFAULT 0,
            is_private INTEGER NOT NULL DEFAULT 0,
            sync_status TEXT NOT NULL DEFAULT 'pending',
            sync_error TEXT
        );

        CREATE TABLE IF NOT EXISTS activity_blocks (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT NOT NULL,
            keyboard_count INTEGER NOT NULL DEFAULT 0,
            mouse_click_count INTEGER NOT NULL DEFAULT 0,
            mouse_activity_score INTEGER NOT NULL DEFAULT 0,
            active_seconds INTEGER NOT NULL DEFAULT 0,
            idle_seconds INTEGER NOT NULL DEFAULT 0,
            activity_percentage INTEGER NOT NULL DEFAULT 0,
            sync_status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS screenshots (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            local_path TEXT,
            encrypted_path TEXT NOT NULL,
            upload_status TEXT NOT NULL DEFAULT 'encrypted',
            screen_number INTEGER NOT NULL DEFAULT 1,
            redaction_applied INTEGER NOT NULL DEFAULT 0,
            deleted INTEGER NOT NULL DEFAULT 0,
            preview_data_url TEXT
        );

        CREATE TABLE IF NOT EXISTS app_usage_summaries (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            app_name TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            sync_status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS manual_time_entries (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            task_id TEXT,
            date TEXT NOT NULL,
            hours INTEGER NOT NULL DEFAULT 0,
            minutes INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            is_billable INTEGER NOT NULL DEFAULT 1,
            sync_status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT NOT NULL,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            workspace_id TEXT NOT NULL DEFAULT '',
            screen_capture_enabled INTEGER NOT NULL DEFAULT 1,
            screenshot_frequency_minutes INTEGER NOT NULL DEFAULT 5,
            screen_capture_mode TEXT NOT NULL DEFAULT 'all',
            screenshot_blur INTEGER NOT NULL DEFAULT 0,
            blur_amount INTEGER NOT NULL DEFAULT 18,
            idle_timeout_minutes INTEGER NOT NULL DEFAULT 5,
            auto_pause_on_idle INTEGER NOT NULL DEFAULT 1,
            track_app_usage INTEGER NOT NULL DEFAULT 1,
            excluded_apps TEXT NOT NULL DEFAULT '[]',
            excluded_domains TEXT NOT NULL DEFAULT '[]',
            private_mode INTEGER NOT NULL DEFAULT 0,
            data_retention_days INTEGER NOT NULL DEFAULT 180,
            encryption_enabled INTEGER NOT NULL DEFAULT 1,
            sync_enabled INTEGER NOT NULL DEFAULT 1,
            ask_before_capture_setup INTEGER NOT NULL DEFAULT 1,
            onboarding_complete INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            next_retry_at INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_project ON tracking_sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_started ON tracking_sessions(started_at);
        CREATE INDEX IF NOT EXISTS idx_blocks_session ON activity_blocks(session_id);
        CREATE INDEX IF NOT EXISTS idx_blocks_started ON activity_blocks(started_at);
        CREATE INDEX IF NOT EXISTS idx_screens_session ON screenshots(session_id);
        CREATE INDEX IF NOT EXISTS idx_screens_captured ON screenshots(captured_at);
        CREATE INDEX IF NOT EXISTS idx_manual_date ON manual_time_entries(date);
        CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue(status);
        "#,
    )?;

    tx.commit()?;
    let _ = conn.execute("ALTER TABLE screenshots ADD COLUMN preview_data_url TEXT", []);
    Ok(())
}

pub fn init_settings_row(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO settings (id) VALUES (1)",
        [],
    )?;
    Ok(())
}
