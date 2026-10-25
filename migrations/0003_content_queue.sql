CREATE TABLE IF NOT EXISTS studio_content_queue (
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, asset_revision INTEGER NOT NULL,
 source_hash TEXT NOT NULL, channel TEXT NOT NULL, not_before TEXT,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','paused','cancelled','published')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(asset_id,asset_revision,channel)
);
CREATE INDEX IF NOT EXISTS studio_content_queue_due ON studio_content_queue(state,not_before);
