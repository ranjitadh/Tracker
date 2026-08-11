// ─────────────────────────────────────────────────────────────
// Time Tracker — native layer.
//
// Modules:
//   app.rs         Tauri commands + tray + app state
//   store.rs       data access over encrypted SQLite
//   db.rs          schema + migrations
//   crypto.rs      AES-256-GCM key + helpers
//   models.rs      serde domain models (camelCase)
//   seed.rs        first-run demo data
//   input.rs       input monitoring (aggregates only, no raw input)
//   tracker.rs     native sensor emitter (input + active app)
//   screenshots.rs capture + encryption
//   app_usage.rs   active application detection
//   activity.rs    pure activity aggregation
//   error.rs       AppError
// ─────────────────────────────────────────────────────────────

mod activity;
mod app;
mod app_usage;
mod crypto;
mod db;
mod error;
mod input;
mod models;
mod screenshots;
mod seed;
mod store;
mod tracker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}
