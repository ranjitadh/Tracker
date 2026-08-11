# Memory — Time Tracker

> This file captures key decisions, gotchas, patterns, and context that should be preserved across development sessions.

---

## 1. Project Identity

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| Name          | Time Tracker                           |
| Version       | 0.1.0                                  |
| Identifier    | `com.ranjit.time-tracker`              |
| License       | Internal / unlicensed                  |
| Status        | All tests passing (28 frontend, 20 Rust) |

---

## 2. Key Architectural Decisions

### Decision: 3-Tier Runtime Architecture (Tauri > Supabase > Mock)
- **Why**: The app supports running as a native desktop app (Tauri + Rust + local SQLite), as a web/cloud app backed by real Supabase Auth & Postgres, or in pure frontend mock mode (backed by `localStorage`).
- **How**: `resolveApi()` in `src/services/api/client.ts` evaluates runtime environment:
  1. `isTauriRuntime()` → `tauriApi`
  2. `isSupabaseConfigured` → `supabaseApi`
  3. Fallback → `mockApi`
- **Consequence**: All three adapters (`tauriAdapter`, `supabaseAdapter`, `mockAdapter`) implement the exact same `Api` interface (35+ methods).

### Decision: Frontend Owns the Session State Machine
- **Why**: Keeping tick, block flush, and capture scheduling in the React/TS layer ensures mock mode works identically. The native layer only provides real sensors.
- **Consequence**: `trackerStore.ts` is the most complex file in the frontend (~383 lines). Changes here must be tested in both modes.

### Decision: Aggregate-Only Input Tracking
- **Why**: Privacy-first mandate — no raw keystrokes, coordinates, or clipboard ever reach storage.
- **What's stored**: `keyboardCount`, `mouseClickCount`, `mouseActivityScore` (0-100), `activeSeconds`, `idleSeconds` per 10-minute block.
- **Consequence**: Can never add features like "last typed word" or "click heatmap".

### Decision: AES-256-GCM for At-Rest Encryption
- **Why**: Industry-standard authenticated encryption. GCM mode gives both confidentiality and tamper detection.
- **Key file**: `tt-master.key` (base64-encoded 256-bit key, chmod 0600 on Unix).
- **Gotcha**: Losing this key means all encrypted data is permanently unreadable.

### Decision: localStorage-backed Sync Queue
- **Why**: Survives crashes, restarts, and tab closes. Simpler than IndexedDB for queue-shaped data.
- **Gotcha**: localStorage has a ~5MB limit per origin. The queue should be flushed regularly.

### Decision: Tailwind 4 via Vite Plugin
- **Why**: No `tailwind.config.js` or `postcss.config.js` needed. All configuration goes through `@theme` in `index.css`.
- **Consequence**: Tailwind config docs for v3 don't apply. Use `@theme` for custom values.

---

## 3. Critical File Locations

| What                  | Path                                        |
| --------------------- | ------------------------------------------- |
| App entry (frontend)  | `src/main.tsx` → `src/App.tsx`              |
| API dispatcher        | `src/services/api/client.ts`                |
| Mock API (huge)       | `src/services/api/mockAdapter.ts` (~29KB)   |
| Tauri adapter         | `src/services/api/tauriAdapter.ts`          |
| Core store            | `src/stores/trackerStore.ts`                |
| Rust entry            | `src-tauri/src/main.rs` → `lib.rs` → `app.rs` |
| Tauri commands        | `src-tauri/src/app.rs` (~25KB)              |
| Database schema       | `src-tauri/src/db.rs`                       |
| Data store (Rust)     | `src-tauri/src/store.rs` (~47KB, largest file) |
| Encryption (Rust)     | `src-tauri/src/crypto.rs`                   |
| Encryption (Frontend) | `src/services/encryption.ts`                |
| Type definitions      | `src/types/index.ts` (all shared types)     |
| Design tokens/CSS     | `src/index.css` (`@theme` block)            |
| Test files            | `tests/timer.test.ts`, `tests/activity.test.ts`, `tests/syncQueue.test.ts` |

---

## 4. Gotchas & Pitfalls

### Port 1420 is Required
- Vite is configured with `strictPort: true` on port 1420. Tauri expects exactly this port. Changing it breaks `npm run tauri dev`.

### Vite Ignores `src-tauri/`
- The watcher config in `vite.config.ts` excludes `src-tauri/**`. Rust file changes won't trigger HMR.

### Mock Adapter Has Seeded Data
- `mockAdapter.ts` initializes with demo workspaces, projects, tasks, and sessions. The first `npm run dev` shows realistic data immediately.

### No Router
- Navigation is manual via `navStore.ts` (stores an active screen name). There's no `react-router` — it's a single-window desktop app.

### `store.rs` Is the Largest File
- At ~47KB with ~1200 lines, `store.rs` contains all Rust data access logic. Refactoring into sub-modules would be beneficial.

### Screenshot Previews in Mock Mode
- In mock mode, screenshots are synthetic (generated data URLs). In Tauri mode, actual screen captures are taken via the `xcap` crate.

### Tray Icon States
- `icons/tray/` contains three state icons: stopped (gray), active (green), paused (amber). The `update_tray` function swaps them based on session phase.

### Recovery on App Restart
- Any session that was `running` or `paused` when the app closed is flagged `pending_recovery`. The UI shows a "Continue or Discard" dialog on next launch.

---

## 5. Test Coverage

| Test File              | Tests | What's Covered                                      |
| ---------------------- | ----- | --------------------------------------------------- |
| `timer.test.ts`        | ~10   | `elapsedSeconds`, `pauseSession`, `resumeSession`, `stopSession`, `markForRecovery` |
| `activity.test.ts`     | ~10   | `combinedActivityScore`, `mouseScoreFromDistance`, `evaluateIdle`, `nextCaptureWindow` |
| `syncQueue.test.ts`    | ~8    | `enqueue`, `flushQueue`, `backoffDelay`, concurrency handling |
| Rust `crypto` tests    | 5     | Roundtrip string/bytes, tamper detection, key stability/rotation |
| Rust `store` tests     | ~15   | Session CRUD, block insertion, screenshot handling, queue ops |

---

## 6. Environment & Tooling

| Tool           | Version/Config                          |
| -------------- | --------------------------------------- |
| Node.js        | 18+                                     |
| TypeScript     | ~5.8.3 (strict, bundler moduleRes)      |
| Vite           | 7.x                                     |
| React          | 19.1.x                                  |
| Zustand        | 5.x                                     |
| Tailwind CSS   | 4.x (Vite plugin, not PostCSS)          |
| Vitest         | 4.x (jsdom environment)                 |
| Rust           | 1.77+ (stable)                          |
| Tauri          | 2.x                                     |
| rusqlite       | 0.31 (bundled SQLite)                   |
| aes-gcm        | 0.10                                    |

---

## 7. Future Considerations

- [ ] **Backend REST API**: The `Api` interface is designed for a future HTTPS backend. The Tauri adapter will eventually proxy to a real server.
- [ ] **Multi-user sync**: Currently single-user. The workspace model is in place for team features.
- [ ] **Plugin system**: The architecture is modular enough to support plugins (e.g., Jira integration, Slack status).
- [ ] **Mobile**: The `#[cfg_attr(mobile, tauri::mobile_entry_point)]` annotation suggests mobile is planned.
- [ ] **Key rotation**: No mechanism exists today. Losing `tt-master.key` is permanent data loss for encrypted fields.
- [ ] **Break `store.rs` apart**: At 47KB it's the largest file and would benefit from being split into sub-modules per entity.
