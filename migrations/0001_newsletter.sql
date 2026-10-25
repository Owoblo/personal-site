CREATE TABLE IF NOT EXISTS newsletter_contacts (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','unsubscribed','bounced','complained')),
 source TEXT NOT NULL DEFAULT 'website',
 legacy_id TEXT,
 created_at TEXT NOT NULL,
 confirmed_at TEXT,
 updated_at TEXT NOT NULL,
 confirmation_hash TEXT,
 confirmation_expires TEXT,
 confirmation_sent_at TEXT
);
CREATE TABLE IF NOT EXISTS newsletter_rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
 id TEXT PRIMARY KEY, post_id INTEGER NOT NULL, subject TEXT NOT NULL, excerpt TEXT NOT NULL,
 article_url TEXT NOT NULL, available_at TEXT NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', initialized INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
 campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(id),
 contact_id TEXT NOT NULL REFERENCES newsletter_contacts(id),
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 message_id TEXT, error TEXT, next_attempt_at TEXT, lease_until TEXT, sent_at TEXT,
 PRIMARY KEY(campaign_id,contact_id)
);
CREATE INDEX IF NOT EXISTS newsletter_deliveries_status ON newsletter_deliveries(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS newsletter_contacts_status ON newsletter_contacts(status);
