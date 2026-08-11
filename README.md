# ⏱️ Time Tracker

A **privacy-first, cross-platform desktop time tracker** built with **Tauri 2**, **Rust**, **React 19**, and **TypeScript**. Designed for transparent, encrypted, offline-first time tracking with rich activity insights.

---

## ✨ Highlights

| Feature | Description |
| --- | --- |
| 🔒 **Privacy first** | No raw keystrokes, passwords, clipboard, or mouse coordinates stored. Only aggregate counters per 10-minute block. |
| 📸 **Transparent screenshots** | Heads-up preview + countdown before every capture. Delete or keep each shot before it leaves the device. |
| 🔐 **Encrypted at rest** | SQLite database with AES-256-GCM encryption. Master key generated per install (`tt-master.key`, mode `0600`). |
| 📡 **Offline-first sync** | Durable localStorage-backed sync queue with exponential backoff + jitter. Never loses data on crash/disconnect. |
| 🖥️ **Live tray icon** | Gray = stopped, Green = active, Amber = paused. Always know the tracking state at a glance. |
| 🧪 **Mock backend mode** | Full UX runs with `npm run dev` in a browser — no Rust, no native permissions needed for frontend development. |
| 🚫 **No silent autostart** | Sessions start only on explicit user action. Unfinished sessions show a "Continue or Discard" prompt. |

---

## 📋 Requirements

### Frontend Development (Mock Mode)
- **Node.js** 18+ and **npm**

### Full Desktop App (Tauri Mode)
- **Node.js** 18+ and **npm**
- **Rust** stable (1.77+) via [rustup](https://rustup.rs)
- System dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, WebView2
  - **Linux**: Various system libraries (see Tauri docs)

---

## 🚀 Getting Started

### Quick Start (Mock Mode — No Rust Required)

```bash
# Clone the repository
cd Time_Tracker/time-tracker

# Install JavaScript dependencies
npm install

# Start the development server (opens at http://localhost:3000)
npm run dev
```

This runs the full UI with a mock API backed by `localStorage`. All features (tracking, screenshots, sync, settings) are fully functional.

### Full Desktop App (Tauri Mode)

```bash
# Install JavaScript dependencies
npm install

# Run the desktop app with hot-reload
npm run tauri dev
```

This compiles the Rust backend and opens the app in a native window with real input monitoring, screen capture, and encrypted storage.

---

## 🧪 Testing & Building

### Run Tests

```bash
# Frontend unit tests (vitest — 28 tests)
npm test

# Rust backend tests (20 tests)
cd src-tauri && cargo test
```

### Build for Production

```bash
# Frontend production bundle (type-check + vite build)
npm run build

# Desktop installer (macOS .app/.dmg, Windows .msi/.exe)
npm run tauri build

# Preview the built frontend
npm run preview
```

**Current status**: ✅ `cargo test` green (20 tests) · ✅ `npm test` green (28 tests) · ✅ `npm run build` green.

---

## 📜 Available Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with mock API mode (port 1420) |
| `npm run build` | TypeScript check + production frontend bundle |
| `npm run preview` | Preview the production frontend build |
| `npm test` | Frontend unit tests (vitest, jsdom) |
| `npm run tauri dev` | Run the full native desktop app with hot-reload |
| `npm run tauri build` | Produce desktop installers for your platform |
| `cd src-tauri && cargo test` | Run Rust backend tests |

---

## 📁 Project Structure

```
time-tracker/
├── index.html                 # Vite entry point (Inter + JetBrains Mono fonts)
├── package.json               # Dependencies & scripts
├── vite.config.ts             # Vite + Tailwind 4 + React + Tauri config
├── vitest.config.ts           # Test config (jsdom, path aliases)
├── tsconfig.json              # TypeScript strict config with @/ alias
│
├── src/                       # ── React Frontend ──────────────────────
│   ├── main.tsx               # ReactDOM entry (StrictMode + TooltipProvider)
│   ├── App.tsx                # Auth gate: LoginScreen or AppShell
│   ├── index.css              # Tailwind 4 @theme tokens (design system)
│   │
│   ├── screens/               # Full-page views
│   │   ├── Dashboard.tsx      # Focus session, timer, charts, screenshots
│   │   ├── LoginScreen.tsx    # Email/password login
│   │   ├── Projects.tsx       # Project/task CRUD
│   │   ├── Timesheet.tsx      # Weekly breakdown + manual entries
│   │   ├── Screenshots.tsx    # Screenshot gallery with filters
│   │   └── Settings.tsx       # 5 tabs: general, privacy, data, sync, audit
│   │
│   ├── components/
│   │   ├── ui/                # 19 Radix UI-based primitives (button, card, dialog, etc.)
│   │   ├── layout/            # AppShell, Sidebar, TopBar, TrackingIndicator
│   │   └── tracker/           # ActivityRing, TimerDisplay, ScreenshotThumb, dialogs
│   │
│   ├── stores/                # Zustand state management
│   │   ├── trackerStore.ts    # Session state machine (core — 383 lines)
│   │   ├── authStore.ts       # Auth, workspace, settings
│   │   ├── syncStore.ts       # Sync queue state, audit events
│   │   └── navStore.ts        # Active screen navigation
│   │
│   ├── services/              # Business logic (pure, testable)
│   │   ├── api/
│   │   │   ├── client.ts      # Api interface + isTauriRuntime() dispatcher
│   │   │   ├── mockAdapter.ts # Full in-memory/localStorage API implementation
│   │   │   └── tauriAdapter.ts # Rust command invoke wrappers
│   │   ├── timer.ts           # Session pause/resume/stop logic
│   │   ├── activity.ts        # Activity scoring, idle detection, capture scheduling
│   │   ├── syncQueue.ts       # Durable offline sync queue with backoff
│   │   ├── encryption.ts      # Web Crypto API AES-256-GCM (mock mode)
│   │   ├── format.ts          # Time/date/sync status formatters
│   │   └── export.ts          # CSV export utilities
│   │
│   ├── types/index.ts         # All shared TypeScript types (mirrors Rust models)
│   ├── hooks/                 # useDashboardData custom hook
│   └── lib/utils.ts           # cn() class merge utility
│
├── tests/                     # ── Frontend Tests ──────────────────────
│   ├── timer.test.ts          # Timer logic tests
│   ├── activity.test.ts       # Activity scoring tests
│   └── syncQueue.test.ts      # Sync queue tests
│
├── src-tauri/                 # ── Rust Backend (Tauri 2) ──────────────
│   ├── Cargo.toml             # Rust dependencies
│   ├── tauri.conf.json        # Tauri app config (window, bundle, CSP)
│   ├── src/
│   │   ├── main.rs            # Binary entry point
│   │   ├── lib.rs             # Module declarations + run()
│   │   ├── app.rs             # 30+ Tauri commands + tray + window control
│   │   ├── store.rs           # SQLite data access layer (~47KB)
│   │   ├── db.rs              # Schema creation + migrations (11 tables)
│   │   ├── models.rs          # Serde domain models (camelCase)
│   │   ├── crypto.rs          # AES-256-GCM key management + helpers
│   │   ├── tracker.rs         # Native input/app emitter threads
│   │   ├── input.rs           # Global keyboard/mouse monitoring
│   │   ├── activity.rs        # Activity scoring (Rust mirror)
│   │   ├── app_usage.rs       # Active app detection (macOS/Windows)
│   │   ├── screenshots.rs     # Capture → preview → encrypt → retain/delete
│   │   ├── seed.rs            # First-run demo data seeding
│   │   └── error.rs           # AppError type (9 variants)
│   └── icons/                 # App icons + tray state icons
│
├── ARCHITECTURE.md            # Deep-dive system architecture
├── DESIGN.md                  # UI/UX design system + component architecture
├── MEMORY.md                  # Key decisions, gotchas, patterns
└── SETUP.md                   # Step-by-step setup guide
```

---

## 🔒 Data & Privacy

- **App data location**:
  - macOS: `~/Library/Application Support/time-tracker/`
  - Windows: `%APPDATA%/time-tracker/`
- **Database**: `time-tracker.db` (SQLite + WAL mode)
- **Encryption key**: `tt-master.key` — generated on first run, `chmod 0600`. **Losing this key means encrypted data is unrecoverable.**
- **Screenshot policy**: Every capture shows a preview instantly and is deletable before sync.
- **What's tracked**: Aggregate counts only (keyboard count, click count, activity score 0-100, active/idle seconds per 10-minute block).
- **What's NOT tracked**: Raw keystrokes, clipboard content, mouse coordinates, passwords, window titles.

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | Tauri 2 (Rust backend + WebView frontend) |
| **Frontend** | React 19 + TypeScript 5.8 |
| **Styling** | Tailwind CSS 4 (Vite plugin) |
| **State** | Zustand 5 |
| **UI Components** | Radix UI + CVA + Lucide Icons |
| **Charts** | Recharts 3 |
| **Build** | Vite 7 |
| **Tests** | Vitest 4 (frontend) + Cargo test (backend) |
| **Database** | SQLite (rusqlite, bundled) |
| **Encryption** | AES-256-GCM (aes-gcm crate / Web Crypto API) |
| **Date handling** | date-fns 4 + chrono (Rust) |
| **PDF export** | jsPDF |

---

## 📄 Documentation

| Document | Description |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview, data flow, security model, conventions |
| [DESIGN.md](./DESIGN.md) | UI design system, component architecture, state management |
| [MEMORY.md](./MEMORY.md) | Key decisions, gotchas, patterns, and future considerations |
| [SETUP.md](./SETUP.md) | Detailed step-by-step setup instructions |

---

## 📝 License

Internal / unlicensed project.
