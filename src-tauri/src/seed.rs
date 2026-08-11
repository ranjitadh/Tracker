// ─────────────────────────────────────────────────────────────
// First-run seed data so the native build mirrors the mock backend
// (alex@acme.test / demo). Inserted only when the users table is
// empty. Mirrors src/services/api/mockAdapter.ts seed.
// ─────────────────────────────────────────────────────────────

use uuid::Uuid;

use crate::error::Result;
use crate::store::Store;

pub fn seed_if_empty(store: &Store) -> Result<()> {
    let count: i64 = store
        .conn
        .lock()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let conn = store.conn.lock().unwrap();

    conn.execute(
        "INSERT INTO users (id, name, email, role, avatar_url) VALUES ('u-admin','Admin User','admin@admin.com','owner',NULL),
         ('u-1','Alex Rivera','alex@acme.test','member',NULL),
         ('u-2','Sam Chen','sam@acme.test','owner',NULL)",
        [],
    )?;

    conn.execute(
        "INSERT INTO workspaces (id, name, role, allow_screenshot_deletion, auto_pause_on_idle, require_manual_notes, screenshot_frequency_minutes)
         VALUES ('w-1','Acme Software','member',1,1,0,10),
                ('w-2','Northstar Design','freelancer',1,0,0,10)",
        [],
    )?;

    conn.execute(
        "INSERT INTO projects (id, workspace_id, name, client, color, is_active) VALUES
         ('p-1','w-1','Website Redesign','Acme Corp','#4F8CFF',1),
         ('p-2','w-1','Mobile App','Acme Corp','#22C55E',1),
         ('p-3','w-1','Internal Tooling','Acme Corp','#F59E0B',1),
         ('p-4','w-2','Brand Refresh','Northstar','#A78BFA',1)",
        [],
    )?;

    conn.execute(
        "INSERT INTO tasks (id, project_id, name, is_active) VALUES
         ('t-1','p-1','Design system',1),
         ('t-2','p-1','Homepage layout',1),
         ('t-3','p-2','Onboarding flow',1),
         ('t-4','p-2','Push notifications',1),
         ('t-5','p-3','CLI tooling',1),
         ('t-6','p-4','Logo exploration',1)",
        [],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO settings (id) VALUES (1)",
        [],
    )?;
    conn.execute(
        "UPDATE settings SET workspace_id='w-1' WHERE id=1",
        [],
    )?;

    drop(conn);

    seed_history(store)
}

fn seed_history(store: &Store) -> Result<()> {
    use chrono::Utc;
    let now = Utc::now();
    let iso = |minutes_ago: i64| (now - chrono::Duration::minutes(minutes_ago)).to_rfc3339();

    let conn = store.conn.lock().unwrap();

    // Sessions: minutes_ago(start, end), active/idle seconds.
    let sessions: Vec<(&str, &str, &str, i64, i64, i64, i64, &str)> = vec![
        ("s-1", "w-1", "p-1", 180, 120, 3590, 240, "t-1"),
        ("s-2", "w-1", "p-2", 120, 62, 3365, 260, "t-3"),
        ("s-3", "w-1", "p-1", 90, 45, 2680, 180, "t-2"),
        ("s-4", "w-1", "p-3", 40, 15, 1400, 210, "t-5"),
    ];

    for (id, ws, pid, start_min, end_min, active, idle, tid) in &sessions {
        let note = match *id {
            "s-1" => "Working on the design system tokens",
            "s-2" => "Onboarding flow implementation",
            "s-3" => "Homepage hero section",
            _ => "CLI parity work",
        };
        let note_enc = store.crypto.encrypt_str(note)?;
        conn.execute(
            "INSERT INTO tracking_sessions
             (id, workspace_id, user_id, project_id, task_id, note_enc, started_at, ended_at, status,
              total_active_seconds, total_idle_seconds, is_manual, is_private, sync_status)
             VALUES (?1,?2,'u-1',?3,?4,?5,?6,?7,'stopped',?8,?9,0,0,'synced')",
            rusqlite::params![
                id, ws, pid, tid, note_enc, iso(*start_min), iso(*end_min), active, idle
            ],
        )?;
    }

    // Activity blocks for the sessions above.
    let block = |session: &str, offset_min: i64, kb: i64, clicks: i64, move_d: i64| -> Result<(String, String, String, i64, i64, i64, i64)> {
        let start = now - chrono::Duration::minutes(offset_min);
        let end = start + chrono::Duration::minutes(10);
        let start_iso = start.to_rfc3339();
        let end_iso = end.to_rfc3339();
        let move_score = ((move_d.min(4000) as f64 / 4000.0) * 100.0).round() as i64;
        Ok((session.to_string(), start_iso, end_iso, kb, clicks, move_score, 600))
    };

    let specs: Vec<(&str, i64, i64, i64, i64)> = vec![
        ("s-1", 170, 42, 8, 6200),
        ("s-1", 160, 30, 4, 3800),
        ("s-1", 150, 12, 2, 900),
        ("s-1", 140, 55, 11, 8100),
        ("s-2", 110, 38, 6, 5100),
        ("s-2", 100, 44, 9, 6400),
        ("s-2", 90, 20, 3, 2200),
        ("s-3", 80, 60, 14, 9000),
        ("s-3", 70, 35, 5, 4400),
        ("s-3", 50, 28, 7, 3600),
        ("s-4", 30, 48, 12, 7000),
    ];

    for (session, offset, kb, clicks, mv) in specs {
        let (session_id, start_iso, end_iso, kb, clicks, score, active) =
            block(session, offset, kb, clicks, mv)?;
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO activity_blocks (id, session_id, started_at, ended_at, keyboard_count, mouse_click_count,
              mouse_activity_score, active_seconds, idle_seconds, activity_percentage, sync_status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,100,'synced')",
            rusqlite::params![id, session_id, start_iso, end_iso, kb, clicks, score, active],
        )?;
    }

    // Screenshots (preview stays None in native mode; list loads metadata).
    let shots: Vec<(&str, i64, i64, bool)> = vec![
        ("s-1", 175, 1, false),
        ("s-1", 165, 1, false),
        ("s-1", 155, 2, true),
        ("s-2", 115, 1, false),
        ("s-2", 105, 1, false),
        ("s-3", 80, 1, false),
        ("s-3", 60, 1, false),
        ("s-4", 35, 1, false),
    ];
    for (session, min_ago, screen, redacted) in shots {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO screenshots (id, session_id, captured_at, encrypted_path, upload_status, screen_number, redaction_applied, deleted)
             VALUES (?1,?2,?3,?4,'uploaded',?5,?6,0)",
            rusqlite::params![id, session, iso(min_ago), format!("seed/{id}.enc"), screen, redacted],
        )?;
    }

    // App usage summaries.
    let usage: Vec<(&str, &str, i64)> = vec![
        ("s-1", "VS Code", 3100),
        ("s-1", "Chrome", 490),
        ("s-2", "Figma", 2100),
        ("s-2", "VS Code", 1265),
        ("s-3", "VS Code", 1800),
        ("s-3", "Slack", 880),
    ];
    for (session, app, secs) in usage {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO app_usage_summaries (id, session_id, app_name, duration_seconds, sync_status)
             VALUES (?1,?2,?3,?4,'synced')",
            rusqlite::params![id, session, app, secs],
        )?;
    }

    // Manual entry for today.
    conn.execute(
        "INSERT INTO manual_time_entries (id, workspace_id, user_id, project_id, task_id, date, hours, minutes, note, is_billable, sync_status)
         VALUES ('m-1','w-1','u-1','p-1','t-1',?1,0,30,'Design review notes',1,'synced')",
        rusqlite::params![Utc::now().format("%Y-%m-%d").to_string()],
    )?;

    Ok(())
}
