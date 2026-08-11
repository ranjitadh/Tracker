// ─────────────────────────────────────────────────────────────
// Native input monitoring.
//
// Runs a background thread polling global input state and reduces
// it to aggregate counters only:
//   • keyboard event count
//   • mouse click count
//   • accumulated mouse movement (a score)
//   • last event timestamp (for idle detection)
//
// It never records WHAT was typed, WHERE the mouse is, or any
// window content. This is the privacy boundary.
//
// Polling via `device_query` (not an event tap) means macOS needs
// no Accessibility permission and we avoid the rdev HIToolbox/TIS
// crash (TIS input-source calls are not safe off the main thread).
// ─────────────────────────────────────────────────────────────

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use device_query::{DeviceQuery, DeviceState, Keycode};

use crate::error::Result;

const POLL_INTERVAL: Duration = Duration::from_millis(120);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSample {
    pub keyboard_count: i64,
    pub mouse_click_count: i64,
    pub movement_score: i64,
    pub last_input_at: Option<i64>,
    pub events_received: i64,
    pub has_permission: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputStatus {
    pub has_permission: bool,
    pub events_received: i64,
    pub last_input_at: Option<i64>,
}

#[derive(Debug, Default)]
pub(crate) struct Counters {
    keyboard: AtomicI64,
    clicks: AtomicI64,
    movement: AtomicI64,
    events_received: AtomicI64,
    last_input_at: AtomicI64, // epoch millis, 0 = never
}

pub struct InputMonitor {
    pub(crate) counters: Arc<Counters>,
    pub(crate) running: Arc<AtomicBool>,
    pub(crate) permission_hint: Arc<AtomicBool>,
}

impl InputMonitor {
    pub fn new() -> Self {
        Self {
            counters: Arc::new(Counters::default()),
            running: Arc::new(AtomicBool::new(false)),
            permission_hint: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Reassemble a monitor from the same underlying counters, used to
    /// hand the Arc handles to a dedicated sampler thread.
    pub fn from_parts(counters: Arc<Counters>, running: Arc<AtomicBool>, permission_hint: Arc<AtomicBool>) -> Self {
        Self { counters, running, permission_hint }
    }

    pub fn start(&self) -> Result<()> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        let counters = self.counters.clone();
        let running = self.running.clone();
        let permission_hint = self.permission_hint.clone();

        thread::Builder::new()
            .name("input-monitor".into())
            .spawn(move || {
                running.store(true, Ordering::SeqCst);
                let state = DeviceState::new();

                let mut prev_keys: HashSet<Keycode> = HashSet::new();
                let mut prev_buttons: Vec<bool> = vec![false; 3];
                let mut prev_pos: Option<(i32, i32)> = None;

                loop {
                    if !running.load(Ordering::SeqCst) {
                        break;
                    }

                    let mut touched = false;

                    // Keyboard: count new key-down transitions since last poll.
                    let now_keys: HashSet<Keycode> = state.get_keys().into_iter().collect();
                    let presses = now_keys.difference(&prev_keys).count() as i64;
                    if presses > 0 {
                        counters.keyboard.fetch_add(presses, Ordering::Relaxed);
                        touched = true;
                    }

                    // Mouse: count button press transitions and accumulate movement.
                    let mouse = state.get_mouse();
                    for (i, &down) in mouse.button_pressed.iter().enumerate() {
                        if down && !prev_buttons[i] {
                            counters.clicks.fetch_add(1, Ordering::Relaxed);
                            touched = true;
                        }
                    }
                    if let Some(prev) = prev_pos {
                        let (x, y) = mouse.coords;
                        let dx = (x - prev.0).abs();
                        let dy = (y - prev.1).abs();
                        if dx + dy > 0 {
                            counters.movement.fetch_add((dx + dy) as i64, Ordering::Relaxed);
                            touched = true;
                        }
                    }

                    if touched {
                        counters
                            .events_received
                            .fetch_add(1, Ordering::Relaxed);
                        counters
                            .last_input_at
                            .store(chrono::Utc::now().timestamp_millis(), Ordering::Relaxed);
                        if counters.events_received.load(Ordering::Relaxed) > 3 {
                            permission_hint.store(true, Ordering::SeqCst);
                        }
                    }

                    prev_keys = now_keys;
                    prev_buttons = mouse.button_pressed;
                    prev_pos = Some(mouse.coords);

                    thread::sleep(POLL_INTERVAL);
                }
                running.store(false, Ordering::SeqCst);
            })?;
        Ok(())
    }

    /// Consume counters accumulated since the last call.
    pub fn take_sample(&self) -> InputSample {
        let keyboard = self.counters.keyboard.swap(0, Ordering::Relaxed);
        let clicks = self.counters.clicks.swap(0, Ordering::Relaxed);
        let movement = self.counters.movement.swap(0, Ordering::Relaxed);
        let events_received = self.counters.events_received.load(Ordering::Relaxed);
        let last_at = self.counters.last_input_at.load(Ordering::Relaxed);
        InputSample {
            keyboard_count: keyboard,
            mouse_click_count: clicks,
            movement_score: movement,
            last_input_at: if last_at > 0 { Some(last_at) } else { None },
            events_received,
            has_permission: self.permission_hint.load(Ordering::SeqCst),
        }
    }

    pub fn status(&self) -> InputStatus {
        let last_at = self.counters.last_input_at.load(Ordering::Relaxed);
        InputStatus {
            has_permission: self.permission_hint.load(Ordering::SeqCst),
            events_received: self.counters.events_received.load(Ordering::Relaxed),
            last_input_at: if last_at > 0 { Some(last_at) } else { None },
        }
    }
}

// ── tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_sample_consumes_counters() {
        let monitor = InputMonitor::new();
        // Simulate events by poking the atomics.
        monitor.counters.keyboard.store(5, Ordering::Relaxed);
        monitor.counters.clicks.store(2, Ordering::Relaxed);
        monitor.counters.movement.store(100, Ordering::Relaxed);

        let sample = monitor.take_sample();
        assert_eq!(sample.keyboard_count, 5);
        assert_eq!(sample.mouse_click_count, 2);
        assert_eq!(sample.movement_score, 100);

        let second = monitor.take_sample();
        assert_eq!(second.keyboard_count, 0);
        assert_eq!(second.mouse_click_count, 0);
        assert_eq!(second.movement_score, 0);
    }

    #[test]
    fn status_reports_no_events_as_no_permission() {
        let monitor = InputMonitor::new();
        let status = monitor.status();
        assert!(!status.has_permission);
        assert_eq!(status.events_received, 0);
        assert!(status.last_input_at.is_none());
    }
}
