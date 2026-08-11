# Architecture

This document describes the Time Tracker architecture, data flow, and the privacy model. It is the reference for how the pieces fit together.

## 1. System overview

```
┌───────────────────────────── Browser / Dev ─────────────────────────────┐
│  React + TS app (Vite)                                                  │
│   screens ── stores (zustand) ── services                                │
│        │  api: mockApi (localStorage)  OR  tauriApi (invoke)             │
└────────┴────────────────────────────────────────────────────────────────┘
                              │
                    isTauriRuntime() decides
                              │
┌───────────────────────────── Tauri shell ───────────────────────────────┐
│  WebView (frontend bundle)                                              │
│        │ invoke("command", payload) / emit("tracker:...", payload)       │
│  Rust backend (src-tauri/src)                                           │
│   app.rs      commands + tray + window control                           │
│   tracker.rs  session/block state machine, capture scheduler             │
│   input.rs    global input counters (aggregate only)                     │
│   activity.rs activity score, idle detection, capture windows            │
│   app_usage.rs foreground-app tracking (macOS NSWorkspace / win)         │
│   screenshots.rs capture → preview → encrypt → retain/delete             │
│   crypto.rs   AES-256-GCM master key + helpers                           │
│   store.rs    SQLite (rusqlite) + sync queue                             │
└──────────────────────────────────────────────────────────────────────────┘
```

Two runtime modes share one frontend:

- **Mock mode** (`npm run dev` in a plain browser): `services/api` dispatches to `mockApi`, which persists to `localStorage`. No native layer required.
- **Tauri mode** (`npm run tauri dev`): the same frontend runs inside the WebView and dispatches to `tauriApi`, which calls the Rust commands via `invoke`.

The dispatcher lives in `src/services/api/index.ts` and switches on `isTauriRuntime()`.

## 2. Core concepts

### Sessions, blocks, and counters
- A **tracking session** is an explicit user action — *Start*, *Pause/Resume*, *Stop*. There is **no silent autostart**.
- While running, input is bucketed into **10-minute activity blocks**.
- Per block only **aggregate counters** are stored:
  - `keyboard_count` (keypress events, count only — never the keys)
  - `mouse_click_count` (click events, count only)
  - `mouse_activity_score` (0–100 derived from movement distance, with ceiling; coordinates are discarded immediately)
  - `active_seconds` / `idle_seconds` (idle detection threshold is configurable, default 5 min)
- No raw keystrokes, passwords, clipboard contents, or mouse coordinates are ever persisted or transmitted.

### Pause, idle, and phase transitions
A session lives in one of `running`, `paused`, `stopped`, or `pending_recovery`:

- **Pause** snapshots active seconds at pause time and records `pausedAt`.
- **Resume** adds the paused interval to `total_paused_seconds`.
- **Stop** freezes active seconds and stamps `endedAt`.
- On app launch, any `running`/`paused` session is marked `pending_recovery`; the UI shows an explicit **continue or discard** prompt (`recover_unfinished_session` / `discard_recovered_session`).

The **tray icon** mirrors the phase: gray = stopped, green = active, amber = paused (`update_tray`).

### Activity scoring
`combinedActivityScore` weights keyboard, clicks, and mouse movement into a 0–100 activity percentage per block. Idle detection uses system idle time where available and a configured timeout. See `src/services/activity.ts` (frontend) and `src-tauri/src/activity.rs` (backend mirror).

### Screenshots
Privacy-first capture flow:

1. A **capture window** is scheduled within each block (mid-block randomized moment).
2. A **heads-up preview + countdown** is shown before capture — the user always sees it coming.
3. The image is **encrypted** (AES-256-GCM, key from `crypto.rs`) before any upload, and is stored locally with a preview for immediate review.
4. The user may **delete** any capture before it syncs; workspace policy can forbid/allow deletion via settings.
5. Only approved captures enter the sync queue.

## 3. Persistence

### Frontend (mock mode)
`localStorage` via the mock API and the sync queue (`services/syncQueue.ts`).

### Backend (Tauri mode)
- **SQLite** via `rusqlite`, WAL mode, at the platform app-data dir:
  `~/Library/Application Support/time-tracker/` on macOS.
- Files: `time-tracker.db` (+ `-wal`/`-shm`), `tt-master.key` (AES-256-GCM key, chmod `0600`, generated on first run).
- Sensitive columns are stored encrypted at rest (base64 ciphertext with per-record nonce), e.g. `notes` and screenshot payloads. See `crypto.rs`.

### Tables
`workspaces`, `projects`, `tasks`, `users`, `tracking_sessions`, `activity_blocks`, `screenshots`, `manual_time_entries`, `settings`, `sync_queue`, `audit_events`.

### Offline-first sync
`services/syncQueue.ts` is a durable queue:

- Items persist to `localStorage`; a crash/restart never loses them.
- Flushing marks items `in_flight` first (prevents double-send), then removes on success.
- Failures are marked `failed` with exponential backoff + jitter (`backoffDelay`), capped at 5 minutes.
- The Rust side has a mirror implementation in `store.rs` (`enqueue`, `replace_if_pending`, `list_queue`, `queue_stats`, `flush_queue`).

## 4. API surface

### Frontend dispatch
`src/services/api/`:

- `index.ts` — dispatcher (`isTauriRuntime()`)
- `mockApi.ts` — in-memory/localStorage implementation of the full contract
- `tauriAdapter.ts` — `invoke` wrappers; documents the exact command names

### Rust commands (implemented in `src-tauri/src/app.rs`)
Auth, workspace, project/task, session lifecycle (`start_tracking`, `pause_tracking`, `resume_tracking`, `stop_tracking`, `recover_unfinished_session`, `discard_recovered_session`), activity (`save_activity_block`, `save_app_usage`, `get_input_status`), screenshots (`capture_screenshot`, `list_screenshots`, `delete_screenshot`), reports (`get_dashboard`, `get_week`), manual entries CRUD, settings, and sync (`sync_now`, `get_sync_state`, `get_queue`, `list_audit_events`).

### Events emitted to the frontend
- `tracker:input` — input counter ticks (aggregate counts only)
- `tracker:phase` — phase/state transitions
- `tracker:app` — foreground app changes
- `screenshot:preview` — new capture available for review

The store layer (`src/stores/trackerStore.ts`) registers these listeners guarded by `isTauriRuntime()`.

## 5. Security model

| Concern | Approach |
| --- | --- |
| Raw input | Never logged. Only aggregate counters per block. |
| Sensitive fields | AES-256-GCM encrypted at rest, key in `tt-master.key` (0600). |
| Screenshot payloads | Encrypted before upload; preview-gated; deletable pre-sync. |
| Sync transport | Durable queue + retry; items only sent after approval. |
| Key loss | Destroys ability to decrypt sensitive fields (documented in README). |
| Autostart | None. Sessions start only on explicit user action. |

## 6. Tests

| Layer | Location | What |
| --- | --- | --- |
| Frontend | `tests/*.test.ts` (vitest) | `timer`, `activity`, `syncQueue` — 28 tests |
| Backend | inline `#[cfg(test)]` modules | store, activity, crypto, input, app_usage — 20 tests |

Run with `npm test` and `cd src-tauri && cargo test`.

## 7. Conventions

- Dark UI tokens: bg `#0B0F14`, surface `#131A22`, border `#263241`, primary `#4F8CFF`, positive `#22C55E`, warning `#F59E0B`, danger `#EF4444`, radius 14px.
- Tailwind 4 via `@tailwindcss/vite` (no postcss/tailwind config files; the Vite plugin handles CSS).
- Rust: `AppError` implements `From<tauri::Error>`; module wiring via `lib.rs` → `app::run()`.
