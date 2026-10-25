export async function onRequestGet({ request, env, params }) {
  const id = Array.isArray(params.id) ? params.id.join("") : params.id;
  if (!/^[a-f0-9-]{36}$/.test(id || "") || !env.NEWSLETTER_DB)
    return new Response("Link not found", { status: 404 });
  const db = env.NEWSLETTER_DB,
    link = await db
      .prepare("SELECT * FROM studio_links WHERE id=?")
      .bind(id)
      .first();
  if (!link) return new Response("Link not found", { status: 404 });
  const target = new URL(link.target);
  if (target.origin !== "https://johnowolabi.com")
    return new Response("Link unavailable", { status: 404 });
  const bot = /bot|spider|crawler|preview|headless|facebookexternalhit/i.test(
    request.headers.get("User-Agent") || "",
  );
  if (
    request.method !== "HEAD" &&
    !bot &&
    !request.headers.get("Purpose")?.includes("prefetch") &&
    request.headers.get("Sec-GPC") !== "1" &&
    request.headers.get("DNT") !== "1"
  ) {
    await db.batch([
      db
        .prepare(
          "INSERT INTO studio_link_days(link_id,day,requests) VALUES (?,?,1) ON CONFLICT(link_id,day) DO UPDATE SET requests=requests+1",
        )
        .bind(id, new Date().toISOString().slice(0, 10)),
      db
        .prepare(
          "UPDATE newsletter_engagement SET clicked_at=COALESCE(clicked_at,?) WHERE link_id=?",
        )
        .bind(new Date().toISOString(), id),
    ]);
  }
  target.searchParams.set("utm_source", link.channel);
  target.searchParams.set(
    "utm_medium",
    link.channel === "email" ? "email" : "social",
  );
  target.searchParams.set("utm_campaign", link.thought_id);
  if (link.asset_id) target.searchParams.set("utm_content", link.asset_id);
  target.searchParams.set("via", id);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export const onRequestHead = onRequestGet;
