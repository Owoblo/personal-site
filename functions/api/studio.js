import { requireAdmin } from "../_lib/auth.js";
import { readPosts } from "../_lib/read-posts.mjs";
import { recordPublication } from "../_lib/publications.mjs";
import {
  thoughtId,
  sourceHash,
  syncThoughts,
  voiceProfile,
  cleanAsset,
  starterAsset,
  createLink,
  formats,
  headers,
} from "../_lib/studio.mjs";
export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const db = context.env.NEWSLETTER_DB;
  if (!db)
    return Response.json(
      { error: "The private workspace is not configured." },
      { status: 503, headers },
    );
  const { posts } = await readPosts(context);
  const requested = new URL(context.request.url).searchParams.get("asset");
  if (requested) {
    const a = await db
      .prepare("SELECT * FROM studio_assets WHERE id=?")
      .bind(requested)
      .first();
    if (!a)
      return Response.json(
        { error: "Adaptation not found." },
        { status: 404, headers },
      );
    const post = posts.find((p) => thoughtId(p) === a.thought_id);
    const publications = await db
      .prepare(
        "SELECT * FROM studio_publications WHERE asset_id=? ORDER BY recorded_at DESC",
      )
      .bind(a.id)
      .all();
    const socialStats = await db
      .prepare("SELECT * FROM studio_social_stats WHERE asset_id=?")
      .bind(a.id)
      .first();
    return Response.json(
      {
        asset: {
          ...a,
          data: JSON.parse(a.data),
          stale: !post || a.source_hash !== (await sourceHash(post)),
          publications: publications.results,
          socialStats,
        },
      },
      { headers },
    );
  }
  await syncThoughts(db, posts);
  const assets = await db
    .prepare(
      "SELECT id,thought_id,format,angle,source_hash,state,revision,created_at,updated_at,json_extract(data,'$.title') AS title FROM studio_assets ORDER BY updated_at DESC",
    )
    .all();
  const inspiration = await db
    .prepare(
      "SELECT * FROM studio_inspiration ORDER BY created_at DESC LIMIT 100",
    )
    .all();
  const hashes = new Map(
    await Promise.all(
      posts.map(async (p) => [thoughtId(p), await sourceHash(p)]),
    ),
  );
  return Response.json(
    {
      posts: posts.map((p) => ({
        id: p.id,
        thoughtId: thoughtId(p),
        title: p.title,
        slug: p.slug,
        status: p.status || "published",
        sourceHash: hashes.get(thoughtId(p)),
      })),
      voice: await voiceProfile(db),
      assets: assets.results.map((a) => ({
        ...a,
        data: { title: a.title },
        lazy: true,
        stale: a.source_hash !== hashes.get(a.thought_id),
      })),
      inspiration: inspiration.results,
      aiConfigured: Boolean(context.env.OPENAI_API_KEY),
    },
    { headers },
  );
}
export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const db = context.env.NEWSLETTER_DB;
  if (!db)
    return Response.json(
      { error: "Workspace unavailable." },
      { status: 503, headers },
    );
  try {
    if (Number(context.request.headers.get("Content-Length")) > 700000)
      return Response.json(
        { error: "Draft too large." },
        { status: 413, headers },
      );
    const body = await context.request.json(),
      now = new Date().toISOString();
    if (body.action === "voice") {
      const voice = body.voice;
      if (
        !voice ||
        ["principles", "avoid", "corrections", "cta"].some(
          (k) => typeof voice[k] !== "string" || voice[k].length > 12000,
        ) ||
        !Array.isArray(voice.examples) ||
        voice.examples.length > 5 ||
        voice.examples.some((v) => !Number.isSafeInteger(v))
      )
        throw Error("Check the voice guide fields.");
      const clean = {
        principles: voice.principles,
        avoid: voice.avoid,
        corrections: voice.corrections,
        cta: voice.cta,
        examples: voice.examples,
      };
      const updated = await db
        .prepare(
          "INSERT INTO studio_settings(id,data,revision,updated_at) VALUES ('voice',?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=revision+1,updated_at=excluded.updated_at WHERE studio_settings.revision=? RETURNING revision",
        )
        .bind(JSON.stringify(clean), now, voice.revision)
        .first();
      if (!updated)
        return Response.json(
          {
            error:
              "The voice guide changed in another session. Reload before saving.",
          },
          { status: 409, headers },
        );
      return Response.json(
        { voice: { ...clean, revision: updated.revision } },
        { headers },
      );
    }
    if (body.action === "inspiration") {
      const url = new URL(body.url);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        String(body.title).length > 200 ||
        String(body.notes).length > 5000
      )
        throw Error("Enter a link, title, and short notes.");
      const item = {
        id: crypto.randomUUID(),
        url: url.href,
        title: String(body.title || "Reference"),
        notes: String(body.notes || ""),
        kind: ["carousel", "video", "writing", "photo"].includes(body.kind)
          ? body.kind
          : "carousel",
        created_at: now,
      };
      await db
        .prepare(
          "INSERT INTO studio_inspiration(id,url,title,notes,kind,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(item.id, item.url, item.title, item.notes, item.kind, now)
        .run();
      return Response.json({ item }, { headers });
    }
    if (body.action === "delete-inspiration") {
      await db
        .prepare("DELETE FROM studio_inspiration WHERE id=?")
        .bind(String(body.id))
        .run();
      return Response.json({ success: true }, { headers });
    }
    if (body.action === "publication") {
      const result = await recordPublication(db, {
        assetId: body.id,
        revision: body.revision,
        url: body.url,
      });
      return Response.json(
        result.conflict ? { error: result.conflict } : result,
        { status: result.conflict ? 409 : 200, headers },
      );
    }
    if (body.action === "social-stats") {
      const asset = await db
        .prepare("SELECT id,revision FROM studio_assets WHERE id=?")
        .bind(String(body.id))
        .first();
      if (!asset) throw Error("Choose a saved adaptation first.");
      const stats = body.stats;
      if (
        !stats ||
        ["views", "likes", "saves", "shares", "comments"].some(
          (k) =>
            !Number.isSafeInteger(stats[k]) || stats[k] < 0 || stats[k] > 1e10,
        )
      )
        throw Error("Enter valid counts.");
      if (stats.url && new URL(stats.url).protocol !== "https:")
        throw Error("Use an https post link.");
      await db
        .prepare(
          "INSERT INTO studio_social_stats(asset_id,platform_url,views,likes,saves,shares,comments,recorded_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET platform_url=excluded.platform_url,views=excluded.views,likes=excluded.likes,saves=excluded.saves,shares=excluded.shares,comments=excluded.comments,recorded_at=excluded.recorded_at",
        )
        .bind(
          asset.id,
          String(stats.url || "").slice(0, 2000),
          stats.views,
          stats.likes,
          stats.saves,
          stats.shares,
          stats.comments,
          now,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO studio_measurements(id,asset_id,revision,platform_url,stats,recorded_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          asset.id,
          asset.revision,
          String(stats.url || "").slice(0, 2000),
          JSON.stringify(stats),
          now,
        )
        .run();
      return Response.json({ success: true }, { headers });
    }
    const { posts } = await readPosts(context),
      post = posts.find((p) => p.id === body.postId);
    if (!post) throw Error("Choose an existing thought.");
    await syncThoughts(db, [post]);
    if (body.action === "link")
      return Response.json(
        await createLink(db, {
          thought: thoughtId(post),
          assetId: body.assetId || null,
          channel: body.channel,
          target: `https://johnowolabi.com/post/${post.slug}/`,
        }),
        { headers },
      );
    if (body.action === "featured") {
      await db
        .prepare(
          "UPDATE studio_thoughts SET featured=? WHERE id=? AND visible=1",
        )
        .bind(body.enabled ? 1 : 0, thoughtId(post))
        .run();
      return Response.json({ success: true }, { headers });
    }
    if (body.action === "start") {
      if (!formats.includes(body.format)) throw Error("Choose a valid format.");
      const id = crypto.randomUUID(),
        data = starterAsset(post),
        hash = await sourceHash(post);
      await db
        .prepare(
          "INSERT INTO studio_assets(id,thought_id,format,angle,source_hash,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          thoughtId(post),
          body.format,
          String(body.angle || "").slice(0, 1000),
          hash,
          JSON.stringify(data),
          now,
          now,
        )
        .run();
      return Response.json(
        {
          asset: {
            id,
            thought_id: thoughtId(post),
            format: body.format,
            angle: body.angle || "",
            source_hash: hash,
            data,
            state: "draft",
            revision: 1,
          },
        },
        { headers },
      );
    }
    if (body.action === "save") {
      const original = await db
        .prepare("SELECT * FROM studio_assets WHERE id=? AND thought_id=?")
        .bind(String(body.id), thoughtId(post))
        .first();
      if (!original) throw Error("This adaptation was not found.");
      const hash = await sourceHash(post);
      if (body.state === "approved" && hash !== original.source_hash)
        throw Error(
          "The original thought changed. Start a fresh adaptation before approving.",
        );
      const data = cleanAsset(body.data),
        state = body.state === "approved" ? "approved" : "draft";
      if (
        body.state === "approved" &&
        original.format === "carousel" &&
        data.slides.some(
          (s) =>
            (s.body.match(/\S+/g) || []).length >
            (data.template === "reading" ? 200 : 70),
        )
      )
        throw Error("Split the long slide before approving the carousel.");
      const saved = await db
        .prepare(
          "UPDATE studio_assets SET data=?,state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision",
        )
        .bind(JSON.stringify(data), state, now, original.id, body.revision)
        .first();
      if (!saved)
        return Response.json(
          {
            error:
              "This adaptation changed in another session. Your local recovery copy is safe.",
          },
          { status: 409, headers },
        );
      await db
        .prepare(
          "INSERT OR IGNORE INTO studio_versions(asset_id,revision,data,created_at) VALUES (?,?,?,?)",
        )
        .bind(original.id, original.revision, original.data, now)
        .run();
      return Response.json(
        {
          asset: {
            ...original,
            data,
            state,
            revision: saved.revision,
            updated_at: now,
          },
        },
        { headers },
      );
    }
    throw Error("Unknown workspace action.");
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers });
  }
}
