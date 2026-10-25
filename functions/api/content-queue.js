import { requireAdmin } from "../_lib/auth.js";
import { readPosts } from "../_lib/read-posts.mjs";
import { thoughtId, sourceHash, headers } from "../_lib/studio.mjs";
import {
  inspectContentQueue,
  publishingChannels,
  channelFits,
} from "../_lib/content-queue.mjs";
export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { posts } = await readPosts(context),
    items = await inspectContentQueue(context.env, posts);
  const download =
    new URL(context.request.url).searchParams.get("download") === "1";
  const result = { version: 1, publishingConnected: false, items };
  if (download) {
    const payloads = [];
    for (const item of items.filter((i) => i.state === "queued")) {
      const a = await context.env.NEWSLETTER_DB.prepare(
        "SELECT data,revision FROM studio_assets WHERE id=?",
      )
        .bind(item.asset_id)
        .first();
      const snapshot =
        a?.revision === item.asset_revision
          ? a
          : await context.env.NEWSLETTER_DB.prepare(
              "SELECT data FROM studio_versions WHERE asset_id=? AND revision=?",
            )
              .bind(item.asset_id, item.asset_revision)
              .first();
      payloads.push({
        ...item,
        payloadRevision: item.asset_revision,
        payloadAvailable: Boolean(snapshot),
        data: snapshot ? JSON.parse(snapshot.data) : null,
      });
    }
    result.items = payloads;
  }
  return Response.json(result, {
    headers: {
      ...headers,
      "Cache-Control": "no-store",
      ...(download
        ? {
            "Content-Disposition":
              'attachment; filename="john-content-queue.json"',
          }
        : {}),
    },
  });
}
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  try {
    if (Number(context.request.headers.get("Content-Length")) > 4096)
      throw Error("Choose a single item.");
    const body = await context.request.json(),
      db = context.env.NEWSLETTER_DB,
      now = new Date().toISOString();
    if (["pause", "resume", "remove"].includes(body.action)) {
      const result = await db
        .prepare(
          "UPDATE studio_content_queue SET state=?,updated_at=? WHERE id=? AND state!='published'",
        )
        .bind(
          body.action === "pause"
            ? "paused"
            : body.action === "remove"
              ? "cancelled"
              : "queued",
          now,
          String(body.id),
        )
        .run();
      if (!result.meta?.changes) throw Error("Queue item not found.");
      return Response.json({ success: true }, { headers });
    }
    if (body.action !== "enqueue" || !publishingChannels.includes(body.channel))
      throw Error("Choose an adaptation and destination.");
    const a = await db
      .prepare("SELECT * FROM studio_assets WHERE id=?")
      .bind(String(body.assetId))
      .first();
    if (!a || a.state !== "approved")
      throw Error("Review and approve this adaptation first.");
    if (a.revision !== body.revision)
      throw Error("This adaptation changed. Reopen it before queueing.");
    if (!channelFits(a.format, body.channel))
      throw Error("This format does not match that destination.");
    const { posts } = await readPosts(context),
      post = posts.find((p) => thoughtId(p) === a.thought_id);
    if (!post || (post.status || "published") !== "published")
      throw Error(
        "Publish the source thought before adding it to distribution.",
      );
    if (a.source_hash !== (await sourceHash(post)))
      throw Error(
        "The source thought changed. Review a fresh adaptation first.",
      );
    const date = body.notBefore ? new Date(body.notBefore) : null;
    if (
      date &&
      (!Number.isFinite(date.getTime()) ||
        date.getTime() > Date.now() + 366 * 86400000)
    )
      throw Error("Choose a valid date within the next year.");
    const row = await db
      .prepare(
        "INSERT INTO studio_content_queue(id,asset_id,asset_revision,source_hash,channel,not_before,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(asset_id,asset_revision,channel) DO UPDATE SET not_before=excluded.not_before,state='queued',updated_at=excluded.updated_at WHERE studio_content_queue.state!='published' RETURNING id",
      )
      .bind(
        crypto.randomUUID(),
        a.id,
        a.revision,
        a.source_hash,
        body.channel,
        date?.toISOString() || null,
        now,
        now,
      )
      .first();
    if (!row) throw Error("This version is already recorded as published.");
    return Response.json(
      { success: true, id: row.id, waitingForConnection: true },
      { headers },
    );
  } catch (e) {
    return Response.json(
      { error: e.message || "Could not save the queue item." },
      { status: 400, headers },
    );
  }
}
