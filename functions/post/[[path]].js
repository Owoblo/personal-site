import { readPosts } from '../_lib/read-posts.mjs';
import { renderPostPage } from '../_lib/render-post.mjs';

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const assets = await context.env.ASSETS.fetch(context.request);
    // Preserve the existing redirects for renamed essays.
    if (assets.status >= 300 && assets.status < 400) return assets;
    const match = url.pathname.match(/^\/post\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
    if (!match) return assets;
    try {
        const { posts } = await readPosts(context);
        const post = posts.find((article) => article.slug === match[1]);
        const status = post?.status || 'published';
        if (!post || (status !== 'published' && status !== 'archived')) {
            const missing = await context.env.ASSETS.fetch(new Request(new URL('/404.html', url)));
            return new Response(missing.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
        }
        const published = posts.filter((article) => (article.status || 'published') === 'published')
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const options = assets.status === 200 ? {} : { ogImageUrl: 'https://johnowolabi.com/11.png' };
        return new Response(renderPostPage(post, published, options), {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    } catch (_) {
        return assets;
    }
}
