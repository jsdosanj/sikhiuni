-- Real engagement tracking for the dashboard streak/heatmap, replacing the
-- previous purely-client-side localStorage streak (dashboard.astro's own
-- `streak()` function, keyed off a locally-stored 'activity' array with no
-- server component at all — per-device, not a genuine time-on-site signal,
-- and lost if the visitor clears storage or switches devices). One row per
-- user per UTC day, incremented server-side by
-- functions/api/activity/heartbeat.js from real client-side mouse/keyboard/
-- scroll/touch activity (assets/activity-tracker.js) while the tab is
-- visible and the visitor isn't idle. Same shape and reasoning as the
-- sibling sikhi.io repo's migrations/0050_daily_activity.sql.
CREATE TABLE IF NOT EXISTS daily_activity (
  user_id        TEXT NOT NULL,
  day            TEXT NOT NULL,                 -- 'YYYY-MM-DD', UTC
  active_seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_day ON daily_activity(user_id, day);
