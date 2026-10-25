import { requireAdmin, isAuthorized } from "../_lib/auth.js";
import { headers, channels } from "../_lib/studio.mjs";
import { tokenHash } from "../_lib/newsletter-store.mjs";
const bot = /bot|spider|crawler|preview|headless|facebookexternalhit/i;
export async function onRequestPost({ request, env }) {
  if (
    !env.NEWSLETTER_DB ||
    request.headers.get("Sec-GPC") === "1" ||
    request.headers.get("DNT") === "1" ||
    bot.test(request.headers.get("User-Agent") || "") ||
    (await isAuthorized(request, env))
  )
    return new Response(null, { status: 204 });
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  try {
    const b = await request.json();
    if (
      !/^[a-f0-9-]{36}$/.test(b.id || "") ||
      !/^[-a-zA-Z0-9]{1,80}$/.test(b.thought || "") ||
      !Number.isInteger(b.seconds) ||
      b.seconds < 0 ||
      b.seconds > 1800 ||
      ![0, 25, 50, 75, 100].includes(b.depth) ||
      !Number.isInteger(b.sequence) ||
      b.sequence < 0 ||
      b.sequence > 200
    )
      return new Response(null, { status: 400 });
    const db = env.NEWSLETTER_DB,
      now = new Date().toISOString(),
      day = now.slice(0, 10);
    const exists = await db
      .prepare("SELECT id FROM studio_thoughts WHERE id=? AND visible=1")
      .bind(b.thought)
      .first();
    if (!exists) return new Response(null, { status: 404 });
    const bucket = await tokenHash(
      `${env.NEWSLETTER_UNSUBSCRIBE_SECRET}:${now.slice(0, 13)}:${request.headers.get("CF-Connecting-IP") || "unknown"}:readings`,
    );
    const rate = await db
      .prepare(
        "INSERT INTO newsletter_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
      )
      .bind(bucket, new Date(Date.now() + 7200000).toISOString())
      .first();
    if (rate.count > 200) return new Response(null, { status: 429 });
    const link = /^[a-f0-9-]{36}$/.test(b.link || "")
      ? await db
          .prepare(
            "SELECT id,channel FROM studio_links WHERE id=? AND thought_id=?",
          )
          .bind(b.link, b.thought)
          .first()
      : null;
    let referrer = "";
    try {
      referrer = new URL(b.referrer || "").hostname.slice(0, 100);
    } catch {}
    await db
      .prepare(
        "INSERT INTO studio_readings(id,thought_id,day,channel,link_id,referrer,seconds,depth,sequence,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET seconds=MAX(seconds,excluded.seconds),depth=MAX(depth,excluded.depth),sequence=excluded.sequence,updated_at=excluded.updated_at WHERE studio_readings.thought_id=excluded.thought_id AND studio_readings.sequence<excluded.sequence",
      )
      .bind(
        b.id,
        b.thought,
        day,
        link?.channel || (channels.includes(b.channel) ? b.channel : "direct"),
        link?.id || null,
        referrer,
        b.seconds,
        b.depth,
        b.sequence,
        now,
      )
      .run();
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const days =
    new URL(context.request.url).searchParams.get("days") === "7" ? 7 : 30;
  const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10),
    db = context.env.NEWSLETTER_DB;
  const readings = await db
    .prepare(
      "SELECT t.id,t.post_id,t.title,t.slug,t.featured,COUNT(r.id) AS views,SUM(CASE WHEN r.seconds>=15 THEN 1 ELSE 0 END) AS engaged,SUM(CASE WHEN r.depth>=75 THEN 1 ELSE 0 END) AS depth75,ROUND(AVG(r.seconds)) AS average_seconds FROM studio_thoughts t LEFT JOIN studio_readings r ON r.thought_id=t.id AND r.day>=? WHERE t.visible=1 GROUP BY t.id ORDER BY views DESC,t.title",
    )
    .bind(since)
    .all();
  const depths = await db
    .prepare(
      "SELECT SUM(CASE WHEN depth>=25 THEN 1 ELSE 0 END) AS q25,SUM(CASE WHEN depth>=50 THEN 1 ELSE 0 END) AS q50,SUM(CASE WHEN depth>=75 THEN 1 ELSE 0 END) AS q75,SUM(CASE WHEN depth>=100 THEN 1 ELSE 0 END) AS q100 FROM studio_readings WHERE day>=?",
    )
    .bind(since)
    .first();
  const links = await db
    .prepare(
      "SELECT l.id,l.thought_id,l.asset_id,l.channel,l.target,t.title AS thought_title,json_extract(a.data,'$.title') AS asset_title,COALESCE(SUM(d.requests),0) AS clicks,(SELECT COUNT(*) FROM newsletter_attribution a JOIN newsletter_contacts c ON c.id=a.contact_id WHERE a.link_id=l.id AND c.status='confirmed') AS signups FROM studio_links l LEFT JOIN studio_thoughts t ON t.id=l.thought_id LEFT JOIN studio_assets a ON a.id=l.asset_id LEFT JOIN studio_link_days d ON d.link_id=l.id AND d.day>=? GROUP BY l.id ORDER BY clicks DESC LIMIT 80",
    )
    .bind(since)
    .all();
  const email = await db
    .prepare(
      "SELECT COUNT(*) AS tracked,SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opens,SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicks FROM newsletter_engagement",
    )
    .first();
  const sources = await db
    .prepare(
      "SELECT channel,COUNT(*) AS views FROM studio_readings WHERE day>=? GROUP BY channel ORDER BY views DESC",
    )
    .bind(since)
    .all();
  const social = await db
    .prepare(
      "SELECT s.*,a.thought_id,a.format FROM studio_social_stats s JOIN studio_assets a ON a.id=s.asset_id ORDER BY s.recorded_at DESC LIMIT 40",
    )
    .all();
  return Response.json(
    {
      days,
      readings: readings.results,
      depths,
      links: links.results,
      email,
      sources: sources.results,
      social: social.results,
    },
    { headers },
  );
}
