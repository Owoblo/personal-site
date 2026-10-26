CREATE TABLE IF NOT EXISTS studio_publications (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform='instagram'),
  permalink TEXT NOT NULL UNIQUE,
  verification TEXT NOT NULL DEFAULT 'reported' CHECK(verification IN ('reported','verified')),
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_publications_asset ON studio_publications(asset_id);
