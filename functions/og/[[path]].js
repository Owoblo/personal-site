import { readPosts } from "../_lib/read-posts.mjs";
export async function onRequestGet(context) {
  const url = new URL(context.request.url),
    match = url.pathname.match(/^\/og\/([a-z0-9]+(?:-[a-z0-9]+)*)\.png$/);
  if (!match) return new Response("Not found", { status: 404 });
  const { posts } = await readPosts(context),
    post = posts.find(
      (p) =>
        p.slug === match[1] &&
        ["published", "archived"].includes(p.status || "published"),
    );
  if (!post) return new Response("Not found", { status: 404 });
  if (context.env.GITHUB_TOKEN && context.env.GITHUB_REPO) {
    try {
      const image = await fetch(
        `https://api.github.com/repos/${context.env.GITHUB_REPO}/contents/og/${post.slug}.png?ref=main`,
        {
          headers: {
            Authorization: `token ${context.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.raw+json",
            "User-Agent": "John-Owolabi-social-card",
          },
        },
      );
      if (image.ok) {
        const bytes = new Uint8Array(await image.arrayBuffer());
        if (
          bytes[0] === 137 &&
          bytes[1] === 80 &&
          bytes[2] === 78 &&
          bytes[3] === 71
        )
          return new Response(bytes, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public,max-age=300",
              "X-Content-Type-Options": "nosniff",
            },
          });
      }
    } catch {}
  }
  const staticImage = await context.env.ASSETS.fetch(context.request);
  if (staticImage.ok) return staticImage;
  const fallback = await context.env.ASSETS.fetch(
    new Request(new URL("/jo-avatar.png", url)),
  );
  return new Response(fallback.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public,max-age=30",
    },
  });
}
