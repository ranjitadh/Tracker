# Design Document — Time Tracker

## 1. Design Philosophy

Time Tracker is built around three pillars:

1. **Privacy first** — The user always knows what is being tracked, when a screenshot will be taken, and has the power to delete any capture before it ever leaves the device.
2. **Offline first** — Every piece of data is written locally (localStorage in mock mode, encrypted SQLite in Tauri mode) before any sync attempt. Crashes, disconnects, and app kills never lose data.
3. **Transparency** — No silent autostart, no raw keystroke/clipboard/coordinate logging, no hidden background processes. Aggregate counters only.

---

## 2. UI / UX Design System

### 2.1 Color Palette (Dark Mode Only)

| Token               | Value       | Usage                          |
| -------------------- | ----------- | ------------------------------ |
| `background`         | `#0B0F14`   | App background                 |
| `surface`            | `#131A22`   | Cards, panels                  |
| `surface-hover`      | `#1A232E`   | Hover state surfaces           |
| `surface-active`     | `#202B38`   | Pressed/active state           |
| `border`             | `#263241`   | Card/input borders             |
| `border-strong`      | `#33455C`   | High-contrast borders          |
| `foreground`         | `#E6EDF5`   | Primary text                   |
| `muted`              | `#8A99AD`   | Secondary text                 |
| `muted-foreground`   | `#64748B`   | Tertiary/disabled text         |
| `primary`            | `#4F8CFF`   | CTA buttons, links, chart line |
| `primary-hover`      | `#6B9DFF`   | Primary hover                  |
| `positive`           | `#22C55E`   | Active/recording state, tray   |
| `warning`            | `#F59E0B`   | Paused/idle state, tray        |
| `danger`             | `#EF4444`   | Stop/delete actions            |

### 2.2 Typography

- **Primary**: `Inter` (weights 400, 500, 600, 700, 800)
- **Monospace**: `JetBrains Mono` (timer display, tabular data)
- Both loaded from Google Fonts (`preconnect` for performance)

### 2.3 Spacing & Radius

| Token        | Value  |
| ------------ | ------ |
| `radius-xl`  | `14px` |
| `radius-lg`  | `12px` |
| `radius-md`  | `10px` |
| `radius-sm`  | `8px`  |

### 2.4 Styling Technology

- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no postcss/tailwind config files)
- CSS custom properties defined in `@theme` block in `src/index.css`
- `class-variance-authority` (CVA) for component variant logic
- `clsx` + `tailwind-merge` for conditional class merging (via `cn()` in `src/lib/utils.ts`)

---

## 3. Component Architecture

### 3.1 Component Hierarchy

```
App.tsx
├── LoginScreen                     (auth gate)
└── AppShell
    ├── Sidebar                     (navigation)
    ├── TopBar                      (workspace selector, user menu, tracking indicator)
    │   └── TrackingIndicator       (live session badge)
    └── <Active Screen>
        ├── Dashboard               (focus session, charts, screenshots)
        ├── Projects                (project/task CRUD)
        ├── Timesheet               (weekly breakdown, manual entries)
        ├── Screenshots             (gallery, filters)
        └── Settings                (5 tabs: general, privacy, data, sync, audit)
```

### 3.2 UI Primitives (`src/components/ui/`)

All 19 UI components are built on **Radix UI** headless primitives with Tailwind styling:

| Component        | Radix Primitive            | Purpose                    |
| ---------------- | -------------------------- | -------------------------- |
| `alert-dialog`   | `@radix-ui/react-alert-dialog` | Destructive confirmations  |
| `dialog`         | `@radix-ui/react-dialog`  | Modals (start session, etc.) |
| `dropdown-menu`  | `@radix-ui/react-dropdown-menu` | Context menus              |
| `select`         | `@radix-ui/react-select`  | Dropdowns                  |
| `tabs`           | `@radix-ui/react-tabs`    | Settings sections          |
| `switch`         | `@radix-ui/react-switch`  | Toggle settings            |
| `tooltip`        | `@radix-ui/react-tooltip` | Hover hints                |
| `progress`       | `@radix-ui/react-progress` | Progress bars              |
| `scroll-area`    | `@radix-ui/react-scroll-area` | Custom scrollbars          |
| `avatar`         | `@radix-ui/react-avatar`  | User avatars               |
| `separator`      | `@radix-ui/react-separator` | Visual dividers            |
| `label`          | `@radix-ui/react-label`   | Form labels                |
| `collapsible`    | `@radix-ui/react-collapsible` | Expandable sections        |
| `card`           | —                          | Surface container          |
| `button`         | `@radix-ui/react-slot`    | CTA / actions              |
| `badge`          | —                          | Status labels              |
| `input`          | —                          | Text fields                |
| `textarea`       | —                          | Multiline text             |
| `skeleton`       | —                          | Loading placeholders       |

### 3.3 Tracker Components (`src/components/tracker/`)

| Component            | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `ActivityRing`       | SVG donut chart showing activity percentage (0–100)    |
| `TimerDisplay`       | Live HH:MM:SS counter from tracker store               |
| `CaptureNotice`      | Toast-like notification after a screenshot capture      |
| `RecoveryDialog`     | "Continue or discard?" prompt for `pending_recovery`   |
| `StartSessionDialog` | Project/task picker + note before starting a session    |
| `ManualEntryDialog`  | Form for manual time entry creation/edit               |
| `ScreenshotModal`    | Full-size screenshot viewer with delete action         |
| `ScreenshotThumb`    | Thumbnail card with timestamp and status badge         |

---

## 4. State Management

All state flows through **Zustand** stores:

### 4.1 `trackerStore.ts` — Session State Machine

The core of the app. Manages:

- **Session lifecycle**: idle → running ↔ paused → stopped, plus `pending_recovery`
- **Live clock tick**: 1s interval computing elapsed seconds
- **Input sampling**: `registerInput()` aggregates keyboard/click/mouse counts into a `SampleWindow`
- **Idle detection**: `evaluateIdle()` triggers auto-pause when configured
- **Activity blocks**: `flushSampleWindow()` persists 10-minute blocks via API
- **Screenshot scheduling**: `CapturePlan` with randomized capture time within each block window

### 4.2 `authStore.ts` — Authentication & Workspace

- Login/logout flow
- Workspace selection (multi-workspace support)
- Settings persistence (`AppSettings`)

### 4.3 `syncStore.ts` — Sync & Audit

- Sync queue inspection
- Manual "Sync Now" trigger
- Audit event log

### 4.4 `navStore.ts` — Navigation

- Active screen routing (sidebar navigation)

---

## 5. Data Flow

### 5.1 Dual-Runtime API Dispatcher

```
                           ┌────────────────────┐
  Screens/Stores ──────▶   │  api (client.ts)   │
                           └───────┬────────────┘
                                   │
                        isTauriRuntime()?
                          ╱              ╲
                  yes    ╱                ╲    no
                        ╱                  ╲
              ┌────────▼──────┐     ┌───────▼──────┐
              │  tauriAdapter │     │  mockAdapter  │
              │  (invoke)     │     │  (localStorage)│
              └───────────────┘     └──────────────┘
```

Both adapters implement the exact same `Api` interface (35+ methods).

### 5.2 Session Lifecycle Flow

```
User clicks "Start"
  → StartSessionDialog picks project/task/note
  → trackerStore.start()
    → api.startTracking()
    → SampleWindow created
    → CapturePlan scheduled
    → 1s tick interval begins

Every 1s (tick):
  → Compute elapsed time
  → Evaluate idle state
  → Maybe auto-pause
  → Maybe trigger screenshot capture

Every ~10min (flush):
  → SampleWindow → ActivityBlock
  → api.saveActivityBlock()
  → App usage samples saved

User clicks "Stop"
  → flushSampleWindow() (final block)
  → api.stopTracking()
  → State reset to idle
```

### 5.3 Screenshot Lifecycle

```
CapturePlan computed (randomized within frequency window)
  → Pre-capture countdown visible to user
  → api.captureScreenshot()
    → [Mock] Generate placeholder preview
    → [Tauri] Capture → encrypt file (AES-256-GCM) → store encrypted
  → CaptureNotice shown with preview
  → User can delete at any time before sync
  → Approved screenshots enter sync queue
```

---

## 6. Offline-First Sync Architecture

### 6.1 Sync Queue (`services/syncQueue.ts`)

```
Enqueue ──▶ localStorage (durable)
                │
         ┌──────▼──────┐
         │  Due items   │ (status=pending|failed, nextRetryAt <= now)
         └──────┬──────┘
                │
         Mark "in_flight"
                │
         Attempt flush
           ╱          ╲
        success      failure
          │             │
     Remove item    Mark "failed"
                    attempts += 1
                    nextRetryAt = now + backoffDelay(attempts)
```

### 6.2 Backoff Strategy

- **Initial**: 2 seconds
- **Growth**: exponential (2^n)
- **Cap**: 5 minutes
- **Jitter**: ±25% to avoid thundering herd

---

## 7. Security Model

### 7.1 Encryption at Rest (Tauri Mode)

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key**: 256-bit random key generated on first launch
- **Key storage**: `tt-master.key` file with `chmod 0600` (Unix)
- **Encrypted fields**: session notes, auth metadata, screenshot files
- **Nonce**: 12-byte random nonce per encryption operation

### 7.2 Frontend Encryption (Mock Mode)

- **Web Crypto API**: `crypto.subtle` for AES-256-GCM
- **Key storage**: Base64-encoded in `localStorage`
- **Purpose**: Full UX fidelity without Rust backend

### 7.3 Privacy Boundaries

| Data Type           | What's Stored                                    | What's NOT Stored            |
| ------------------- | ------------------------------------------------ | ---------------------------- |
| Keyboard            | Count per 10-min block                           | Actual keystrokes            |
| Mouse clicks        | Count per 10-min block                           | Click coordinates            |
| Mouse movement      | Activity score (0-100)                           | Raw coordinates/paths        |
| Clipboard           | Nothing                                          | Any clipboard content        |
| Screenshots         | Encrypted file + metadata                        | Raw image without encryption |
| Active app          | App name + duration                              | Window title, URL content    |

---

## 8. Database Schema (SQLite)

11 tables with strategic indexing:

| Table                | Purpose                                |
| -------------------- | -------------------------------------- |
| `users`              | User identity                          |
| `workspaces`         | Organization/team containers           |
| `projects`           | Project entities with color coding     |
| `tasks`              | Tasks nested under projects            |
| `tracking_sessions`  | Session lifecycle (core entity)        |
| `activity_blocks`    | 10-minute aggregate activity windows   |
| `screenshots`        | Screenshot metadata (paths, status)    |
| `app_usage_summaries`| Per-app time summaries                 |
| `manual_time_entries`| Manually logged time                   |
| `settings`           | Singleton row for app configuration    |
| `sync_queue`         | Durable sync queue with retry state    |
| `audit_events`       | Immutable audit trail                  |

**WAL mode** for concurrent read/write. **Foreign keys ON**. **Busy timeout 5s**.

---

## 9. Charting & Visualization

- **Library**: Recharts 3
- **Dashboard chart**: `AreaChart` with gradient fill showing activity % per 10-minute block
- **Activity ring**: Custom SVG donut (`ActivityRing.tsx`) for today's activity score
- **Timesheet**: Weekly stacked bar charts for project-level time breakdown

---

## 10. Cross-Platform Considerations

| Feature              | macOS                                    | Windows                                |
| -------------------- | ---------------------------------------- | -------------------------------------- |
| Active app detection | `NSWorkspace` via `objc2-app-kit`        | `windows-sys` Win32 APIs               |
| Key file permissions | `chmod 0600`                             | Default ACLs                           |
| App data path        | `~/Library/Application Support/time-tracker/` | `%APPDATA%/time-tracker/`              |
| Screen capture       | `xcap` crate                             | `xcap` crate                           |
| Input monitoring     | `device_query` crate                     | `device_query` crate                   |
| Tray icon            | macOS system tray                        | Windows system tray                    |
| Bundle output        | `.app` / `.dmg`                          | `.msi` / `.exe`                        |
