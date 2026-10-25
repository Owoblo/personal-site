import { readPosts } from './_lib/read-posts.mjs';

const SITE = 'https://johnowolabi.com';
const xml = (value) => String(value || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = (value) => '<![CDATA[' + String(value || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';

export function renderFeed(posts) {
    const published = posts.filter((post) => (post.status || 'published') === 'published')
        .sort((a, b) => Date.parse(b.firstPublishedAt || b.date) - Date.parse(a.firstPublishedAt || a.date));
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xml:base="${SITE}/">
<channel>
<title>John Owolabi — Thoughts</title>
<link>${SITE}/thoughts</link>
<description>Building things. Studying people. Questioning assumptions.</description>
<language>en</language>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${published.map((post) => {
    const date = new Date(post.firstPublishedAt || `${post.date}T12:00:00Z`);
    const content = post.content.replace(/\b(href|src)=(['"])(\/(?!\/)[^'"]*)\2/g,
        (_match, attribute, quote, url) => `${attribute}=${quote}${SITE}${url}${quote}`);
    return `<item>
<title>${xml(post.title)}</title>
<link>${SITE}/post/${encodeURIComponent(post.slug)}/</link>
<guid isPermaLink="false">urn:johnowolabi:post:${xml(post.id)}</guid>
<pubDate>${date.toUTCString()}</pubDate>
<description>${xml(post.excerpt)}</description>
<content:encoded>${cdata(content)}</content:encoded>
</item>`;
}).join('\n')}
</channel></rss>`;
}

export async function onRequestGet(context) {
    try {
        const { posts } = await readPosts(context);
        return new Response(renderFeed(posts), { headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
        } });
    } catch (_) {
        return new Response('Feed temporarily unavailable', { status: 503 });
    }
}
