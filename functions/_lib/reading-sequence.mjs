import { thoughtId } from "./studio.mjs";
import { renderBrandedEmail } from "./branded-email.mjs";
import { randomToken, tokenHash } from "./newsletter-store.mjs";
import { sendEmail, suppressionReason } from "./ses.mjs";
export async function sequencePreview(db, posts) {
  const config = await db
    .prepare("SELECT data FROM studio_settings WHERE id='reading-sequence'")
    .first();
  const confirmed = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM newsletter_contacts WHERE status='confirmed'",
      )
      .first(),
    pending = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM newsletter_contacts WHERE status='pending'",
      )
      .first();
  const reminderEligible = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM newsletter_contacts c LEFT JOIN newsletter_preferences p ON p.contact_id=c.id WHERE c.status='pending' AND c.created_at>=? AND c.created_at<? AND p.reminder_sent_at IS NULL AND c.source!='owner-test'",
    )
    .bind(
      new Date(Date.now() - 180 * 86400000).toISOString(),
      new Date(Date.now() - 3 * 86400000).toISOString(),
    )
    .first();
  const { results: readers } = await db
    .prepare(
      "SELECT c.id,c.created_at,p.sequence_floor FROM newsletter_contacts c JOIN newsletter_preferences p ON p.contact_id=c.id WHERE c.status='confirmed' AND p.archive_enabled=1 AND NOT EXISTS(SELECT 1 FROM newsletter_deliveries d WHERE d.contact_id=c.id AND (d.status IN ('pending','sending','uncertain') OR (d.status='failed' AND d.attempts<8))) AND NOT EXISTS(SELECT 1 FROM newsletter_deliveries d WHERE d.contact_id=c.id AND d.status='submitted' AND d.sent_at>?) LIMIT 50",
    )
    .bind(new Date(Date.now() - 86400000).toISOString())
    .all();
  const sorted = posts
      .filter((p) => (p.status || "published") === "published")
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    candidates = [];
  for (const reader of readers) {
    const history = await db
      .prepare(
        "SELECT c.post_id FROM newsletter_deliveries d JOIN newsletter_campaigns c ON c.id=d.campaign_id WHERE d.contact_id=? AND d.status IN ('submitted','uncertain','pending','sending')",
      )
      .bind(reader.id)
      .all();
    const sent = new Set(history.results.map((h) => h.post_id));
    const post = sorted.find(
      (p) => p.date >= reader.sequence_floor.slice(0, 10) && !sent.has(p.id),
    );
    if (post) candidates.push({ reader: reader.id, post });
  }
  const groups = new Map();
  for (const item of candidates) {
    const key = thoughtId(item.post);
    if (!groups.has(key))
      groups.set(key, { thoughtId: key, title: item.post.title, readers: 0 });
    groups.get(key).readers++;
  }
  return {
    enabled: config ? JSON.parse(config.data).enabled === true : false,
    confirmed: confirmed.count,
    pending: pending.count,
    reminderEligible: reminderEligible.count,
    queue: [...groups.values()],
    candidates,
  };
}
export async function queueReadingSequence(env, posts) {
  const db = env.NEWSLETTER_DB;
  await db
    .prepare(
      "INSERT OR IGNORE INTO newsletter_preferences(contact_id,archive_enabled,sequence_floor) SELECT id,1,created_at FROM newsletter_contacts WHERE status='confirmed' AND legacy_id IS NOT NULL",
    )
    .run();
  const preview = await sequencePreview(db, posts);
  if (!preview.enabled) return 0;
  let queued = 0;
  for (const { reader, post } of preview.candidates.slice(0, 3)) {
    const now = new Date().toISOString(),
      id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO newsletter_campaigns(id,post_id,subject,excerpt,article_url,available_at,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          post.id,
          post.title,
          post.excerpt,
          `https://johnowolabi.com/post/${post.slug}/`,
          now,
          now,
        ),
      db
        .prepare(
          "INSERT INTO newsletter_campaign_meta(campaign_id,kind,target_contact_id) VALUES (?,'archive',?)",
        )
        .bind(id, reader),
    ]);
    queued++;
  }
  return queued;
}
export async function sendConfirmationReminders(env) {
  const db = env.NEWSLETTER_DB,
    config = await db
      .prepare(
        "SELECT data FROM studio_settings WHERE id='confirmation-reminders'",
      )
      .first();
  if (!config || JSON.parse(config.data).enabled !== true) return 0;
  const { results } = await db
    .prepare(
      "SELECT c.id,c.email,c.created_at FROM newsletter_contacts c LEFT JOIN newsletter_preferences p ON p.contact_id=c.id WHERE c.status='pending' AND c.created_at>=? AND c.created_at<? AND p.reminder_sent_at IS NULL AND c.source!='owner-test' LIMIT 1",
    )
    .bind(
      new Date(Date.now() - 180 * 86400000).toISOString(),
      new Date(Date.now() - 3 * 86400000).toISOString(),
    )
    .all();
  let sent = 0;
  for (const contact of results) {
    const suppressed=await suppressionReason(env,contact.email);if(suppressed){await db.prepare('UPDATE newsletter_contacts SET status=? WHERE id=?').bind(suppressed==='COMPLAINT'?'complained':'bounced',contact.id).run();continue;}
    const now = new Date().toISOString(),
      token = randomToken();
    const claimed = await db
      .prepare(
        "INSERT INTO newsletter_preferences(contact_id,archive_enabled,sequence_floor,reminder_sent_at) VALUES (?,1,?,?) ON CONFLICT(contact_id) DO UPDATE SET reminder_sent_at=excluded.reminder_sent_at WHERE newsletter_preferences.reminder_sent_at IS NULL RETURNING contact_id",
      )
      .bind(contact.id, contact.created_at, now)
      .first();
    if (!claimed) continue;
    await db
      .prepare(
        "UPDATE newsletter_contacts SET confirmation_hash=?,confirmation_expires=?,confirmation_sent_at=? WHERE id=? AND status='pending'",
      )
      .bind(
        await tokenHash(token),
        new Date(Date.now() + 86400000).toISOString(),
        now,
        contact.id,
      )
      .run();
    const message = renderBrandedEmail({
      title: "Still want to stay in touch?",
      excerpt:
        "You asked to receive my thoughts but haven’t confirmed your email yet. If you’d still like to join, confirm below. This is the only reminder I’ll send.",
      articleUrl: `https://johnowolabi.com/api/confirm-subscription?token=${encodeURIComponent(token)}`,
      confirmation: true,
    });
    await sendEmail(env, {
      to: contact.email,
      subject: "Still want to stay in touch? — John Owolabi",
      ...message,
    });
    sent++;
  }
  return sent;
}
