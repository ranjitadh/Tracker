// ─────────────────────────────────────────────────────────────
// Native tracking loop.
//
// The frontend is the orchestrator for the session state machine
// (tick, blocks, capture scheduling) — that keeps the whole loop
// working in mock mode with `npm run dev`. The native layer is
// responsible for the SENSORS it can't fake:
//   • real keyboard/mouse deltas (device_query) emitted each second
//   • active application name for app-usage summaries
//   • permission status so the UI can prompt for Accessibility
//
// Events emitted:
//   tracker:input   -> InputSample (deltas since last second)
//   tracker:app     -> { appName: Option<String> } (current frontmost app)
// ─────────────────────────────────────────────────────────────

use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::app_usage::active_app_name;
use crate::error::Result;
use crate::input::InputMonitor;

pub struct Tracker {
    pub monitor: InputMonitor,
}

pub fn spawn(app: AppHandle) -> Result<Tracker> {
    let monitor = InputMonitor::new();
    monitor.start()?;

    // 1s cadence: sample deltas and push them to the frontend.
    let monitor_for_input = monitor.clone_for_thread();
    let app_for_input = app.clone();
    std::thread::Builder::new()
        .name("tracker-input".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_millis(1000));
            let sample = monitor_for_input.take_sample();
            let _ = app_for_input.emit("tracker:input", &sample);
        })?;

    // Active app emitter (only when a session is live; cheap enough to always run).
    let app_for_app = app.clone();
    std::thread::Builder::new()
        .name("tracker-app".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(5));
            let name = active_app_name();
            let _ = app_for_app.emit("tracker:app", &serde_json::json!({ "appName": name }));
        })?;

    Ok(Tracker { monitor })
}

// InputMonitor isn't Clone today; this gives the thread its own Arc handles.
impl InputMonitor {
    pub fn clone_for_thread(&self) -> InputMonitor {
        InputMonitor::from_parts(self.counters.clone(), self.running.clone(), self.permission_hint.clone())
    }
}
