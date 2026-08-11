# Setup Guide — Time Tracker

Step-by-step instructions to get the Time Tracker running on your machine.

---

## Mode 1: Frontend Only (Mock Mode)

> Best for: Frontend development, UI prototyping, testing features without Rust.

### Prerequisites

- **Node.js** 18 or later — [download](https://nodejs.org/)
- **npm** (comes with Node.js)

### Steps

```bash
# 1. Navigate to the project
cd Time_Tracker/time-tracker

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

The app opens at **http://localhost:3000** with a full mock API backed by `localStorage` (or your Supabase backend if configured). All features work seamlessly.

### Default Login Credentials (Mock Mode)

The mock adapter accepts any email/password combination. It seeds demo data including:
- 1 workspace ("Acme Corp")
- 3 projects with color-coded categories
- Sample tasks per project
- Demo activity blocks and screenshots

---

## Mode 2: Full Desktop App (Tauri Mode)

> Best for: Testing native features (real input monitoring, actual screenshots, encrypted storage, tray icon).

### Prerequisites

1. **Node.js 18+** and **npm**
2. **Rust stable (1.77+)**:
   ```bash
   # Install Rust via rustup
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Verify installation
   rustc --version
   cargo --version
   ```

3. **Platform-specific dependencies**:

#### macOS
```bash
# Xcode Command Line Tools
xcode-select --install
```

#### Windows
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ workload)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Steps

```bash
# 1. Navigate to the project
cd Time_Tracker/time-tracker

# 2. Install JS dependencies
npm install

# 3. Run the full desktop app (builds Rust + opens window)
npm run tauri dev
```

On first run:
- The Rust backend compiles (~2-5 minutes on first build, subsequent builds are fast)
- A `tt-master.key` is generated in the app data directory
- The SQLite database is created and seeded with demo data
- The tray icon appears (gray = stopped)

### macOS Permissions

On macOS, you may need to grant **Accessibility** permissions for input monitoring:
- System Settings → Privacy & Security → Accessibility → Add your terminal/app

---

## Running Tests

### Frontend Tests
```bash
# From the project root
npm test

# Watch mode
npx vitest --watch

# With coverage
npx vitest --coverage
```

### Rust Backend Tests
```bash
# Navigate to the Rust project
cd src-tauri

# Run all tests
cargo test

# Run a specific test
cargo test roundtrip_string

# Run with output
cargo test -- --nocapture
```

---

## Building for Production

### Frontend Bundle Only
```bash
npm run build
# Output: dist/
```

### Desktop Installer
```bash
npm run tauri build
# Output (macOS):   src-tauri/target/release/bundle/dmg/
# Output (Windows): src-tauri/target/release/bundle/msi/
```

---

## Manual Bash Commands Reference

Here's every command you might need, in order:

```bash
# ── SETUP ────────────────────────────────────────────────────
# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Navigate to project
cd /path/to/Time_Tracker/time-tracker

# Install Node.js dependencies
npm install

# ── DEVELOPMENT ──────────────────────────────────────────────
# Frontend only (mock mode, no Rust)
npm run dev

# Full desktop app (Rust + frontend)
npm run tauri dev

# ── TESTING ──────────────────────────────────────────────────
# Frontend tests
npm test

# Rust tests
cd src-tauri && cargo test && cd ..

# ── BUILDING ─────────────────────────────────────────────────
# Production frontend bundle
npm run build

# Preview built frontend
npm run preview

# Production desktop installer
npm run tauri build

# ── TROUBLESHOOTING ──────────────────────────────────────────
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Rust build cache
cd src-tauri && cargo clean && cd ..

# Check Rust toolchain
rustup show
rustc --version
cargo --version

# Check Node version
node --version
npm --version

# Kill process on port 1420 (if port is busy)
lsof -ti:1420 | xargs kill -9

# View app data (macOS)
ls ~/Library/Application\ Support/time-tracker/

# View the encryption key (macOS)
ls -la ~/Library/Application\ Support/time-tracker/tt-master.key

# View the database (macOS, requires sqlite3)
sqlite3 ~/Library/Application\ Support/time-tracker/time-tracker.db ".tables"
```

---

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `TAURI_DEV_HOST` | Custom dev server host for remote debugging | `localhost` |

---

## Common Issues

### Port 1420 is already in use
```bash
lsof -ti:1420 | xargs kill -9
npm run dev
```

### Rust compilation fails
```bash
rustup update stable
cd src-tauri && cargo clean && cargo build
```

### Missing Tauri CLI
```bash
npm install @tauri-apps/cli@latest --save-dev
```

### Input monitoring not working (macOS)
Grant Accessibility permissions: **System Settings → Privacy & Security → Accessibility** → Toggle your terminal app.

### Screenshots not captured
Grant Screen Recording permissions: **System Settings → Privacy & Security → Screen Recording** → Toggle your terminal app.
