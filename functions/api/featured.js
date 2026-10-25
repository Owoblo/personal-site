export async function onRequestGet({ env }) {
  if (!env.NEWSLETTER_DB) return Response.json({ posts: [] });
  const data = await env.NEWSLETTER_DB.prepare(
    "SELECT id,slug,title FROM studio_thoughts WHERE visible=1 AND featured=1 ORDER BY updated_at DESC LIMIT 5",
  ).all();
  return Response.json(
    { posts: data.results },
    { headers: { "Cache-Control": "public,max-age=60" } },
  );
}
