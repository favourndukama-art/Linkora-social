-- Raw events used by funnel and creator analytics.
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  event_type TEXT NOT NULL,
  granularity TEXT NOT NULL DEFAULT 'raw',
  bucket TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time
  ON analytics_events (user_address, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time
  ON analytics_events (event_type, occurred_at DESC);
