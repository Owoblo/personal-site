import { requireAdmin } from "../_lib/auth.js";
import { readPosts } from "../_lib/read-posts.mjs";
import { sequencePreview } from "../_lib/reading-sequence.mjs";
import { headers } from "../_lib/studio.mjs";
export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { posts } = await readPosts(context);
  const { candidates, ...preview } = await sequencePreview(
    context.env.NEWSLETTER_DB,
    posts,
  );
  return Response.json(preview, { headers });
}
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  try {
    const body = await context.request.json(),
      db = context.env.NEWSLETTER_DB,
      now = new Date().toISOString();
    if (body.action === "enabled") {
      await db
        .prepare(
          "INSERT INTO studio_settings(id,data,updated_at) VALUES ('reading-sequence',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
        )
        .bind(JSON.stringify({ enabled: body.enabled === true }), now)
        .run();
      if (body.enabled)
        await db
          .prepare(
            "INSERT OR IGNORE INTO newsletter_preferences(contact_id,archive_enabled,sequence_floor) SELECT id,1,created_at FROM newsletter_contacts WHERE status='confirmed' AND legacy_id IS NOT NULL",
          )
          .run();
      return Response.json({ success: true }, { headers });
    }
    if (body.action === "reminders") {
      await db
        .prepare(
          "INSERT INTO studio_settings(id,data,updated_at) VALUES ('confirmation-reminders',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
        )
        .bind(JSON.stringify({ enabled: true }), now)
        .run();
      return Response.json({ success: true }, { headers });
    }
    throw Error("Unknown sequence action.");
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400, headers });
  }
}
