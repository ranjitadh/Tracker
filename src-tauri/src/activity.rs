// ─────────────────────────────────────────────────────────────
// Activity aggregation: reduces raw input samples into 10-minute
// activity blocks with aggregate metrics only. Pure functions so
// they're unit-testable without a device.
// ─────────────────────────────────────────────────────────────

pub const BLOCK_MINUTES: i64 = 10;
pub const BLOCK_SECONDS: i64 = BLOCK_MINUTES * 60;
const MOVE_FULL_SCORE: i64 = 4000;

#[derive(Debug, Clone)]
pub struct BlockCounters {
    pub keyboard: i64,
    pub clicks: i64,
    pub movement: i64,
}

#[derive(Debug, Clone)]
pub struct BlockInput {
    pub started_at_ms: i64,
    pub ended_at_ms: i64,
    pub counters: BlockCounters,
    pub idle_seconds: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BlockAggregate {
    pub started_at: String,
    pub ended_at: String,
    pub keyboard_count: i64,
    pub mouse_click_count: i64,
    pub mouse_activity_score: i64,
    pub active_seconds: i64,
    pub idle_seconds: i64,
    pub activity_percentage: i64,
}

pub fn mouse_score_from_distance(distance: i64) -> i64 {
    if distance <= 0 {
        return 0;
    }
    if distance >= MOVE_FULL_SCORE {
        return 100;
    }
    (distance as f64 / MOVE_FULL_SCORE as f64 * 100.0).round() as i64
}

pub fn compute_activity_block(input: BlockInput) -> BlockAggregate {
    let window_seconds = (input.ended_at_ms - input.started_at_ms).max(0) / 1000;
    let idle = input.idle_seconds.clamp(0, window_seconds);
    let active = (window_seconds - idle).max(0);

    let activity_percentage = if window_seconds > 0 {
        (active as f64 / window_seconds as f64 * 100.0).round() as i64
    } else {
        0
    };

    BlockAggregate {
        started_at: iso_from_ms(input.started_at_ms),
        ended_at: iso_from_ms(input.ended_at_ms),
        keyboard_count: input.counters.keyboard,
        mouse_click_count: input.counters.clicks,
        mouse_activity_score: mouse_score_from_distance(input.counters.movement),
        active_seconds: active,
        idle_seconds: idle,
        activity_percentage,
    }
}

/// Idle is reached when no input arrived for `timeout_seconds`.
pub fn is_idle(last_input_at_ms: Option<i64>, now_ms: i64, timeout_seconds: i64) -> bool {
    match last_input_at_ms {
        Some(last) => now_ms - last >= timeout_seconds * 1000,
        None => true,
    }
}

fn iso_from_ms(ms: i64) -> String {
    let secs = (ms / 1000) as i64;
    let nanos = ((ms % 1000) * 1_000_000) as u32;
    let dt = chrono::DateTime::from_timestamp(secs, nanos).unwrap_or_else(chrono::Utc::now);
    dt.to_rfc3339()
}

// ── tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(minutes: i64) -> i64 {
        chrono::Utc::now().timestamp_millis() + minutes * 60_000
    }

    #[test]
    fn mouse_score_scales() {
        assert_eq!(mouse_score_from_distance(0), 0);
        assert_eq!(mouse_score_from_distance(2000), 50);
        assert_eq!(mouse_score_from_distance(4000), 100);
        assert_eq!(mouse_score_from_distance(9000), 100);
    }

    #[test]
    fn block_with_no_idle_is_full_active() {
        let b = compute_activity_block(BlockInput {
            started_at_ms: ms(0),
            ended_at_ms: ms(10),
            counters: BlockCounters { keyboard: 100, clicks: 20, movement: 5000 },
            idle_seconds: 0,
        });
        assert_eq!(b.active_seconds, 600);
        assert_eq!(b.idle_seconds, 0);
        assert_eq!(b.activity_percentage, 100);
        assert_eq!(b.mouse_activity_score, 100);
    }

    #[test]
    fn block_with_idle_splits_time() {
        let b = compute_activity_block(BlockInput {
            started_at_ms: ms(0),
            ended_at_ms: ms(10),
            counters: BlockCounters { keyboard: 0, clicks: 0, movement: 0 },
            idle_seconds: 240,
        });
        assert_eq!(b.active_seconds, 360);
        assert_eq!(b.idle_seconds, 240);
        assert_eq!(b.activity_percentage, 60);
    }

    #[test]
    fn idle_seconds_capped_to_window() {
        let b = compute_activity_block(BlockInput {
            started_at_ms: ms(0),
            ended_at_ms: ms(10),
            counters: BlockCounters { keyboard: 5, clicks: 1, movement: 100 },
            idle_seconds: 999,
        });
        assert_eq!(b.idle_seconds, 600);
        assert_eq!(b.active_seconds, 0);
        assert_eq!(b.activity_percentage, 0);
    }

    #[test]
    fn idle_detection_respects_timeout() {
        let now = chrono::Utc::now().timestamp_millis();
        assert!(is_idle(None, now, 300));
        assert!(!is_idle(Some(now - 10_000), now, 300));
        assert!(is_idle(Some(now - 400_000), now, 300));
    }
}
