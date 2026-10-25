const pixel = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);
export async function onRequestGet({ request, env, params }) {
  const id = (
    Array.isArray(params.id) ? params.id.join("") : params.id || ""
  ).replace(/\.gif$/, "");
  if (
    /^[a-f0-9-]{36}$/.test(id) &&
    env.NEWSLETTER_DB &&
    request.method !== "HEAD"
  )
    await env.NEWSLETTER_DB.prepare(
      "UPDATE newsletter_engagement SET open_count=open_count+1,opened_at=COALESCE(opened_at,?) WHERE id=?",
    )
      .bind(new Date().toISOString(), id)
      .run();
  return new Response(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function onRequestHead() {
  return new Response(null, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}
