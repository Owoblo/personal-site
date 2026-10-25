import { readPosts } from './_lib/read-posts.mjs';
import { isAuthorized } from './_lib/auth.js';

export async function onRequestGet(context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Cookie',
  };
  try {
    const data = await readPosts(context);
    const posts = await isAuthorized(context.request, context.env)
      ? data.posts
      : data.posts.filter((post) => (post.status || 'published') === 'published');
    return new Response(JSON.stringify({ ...data, posts }), { headers });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Articles are temporarily unavailable' }), { status: 503, headers });
  }
}
