const encoder = new TextEncoder();
export const SITE = 'https://johnowolabi.com';

export const nowISO = () => new Date().toISOString();
export const randomToken = () => crypto.randomUUID() + crypto.randomUUID();
export async function tokenHash(value) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function signature(id, secret) {
    if (!secret || secret.length < 32) throw new Error('Email preferences are not configured.');
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`unsubscribe:${id}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function unsubscribeUrl(env, id) {
    return `${SITE}/api/unsubscribe?id=${encodeURIComponent(id)}&token=${await signature(id, env.NEWSLETTER_UNSUBSCRIBE_SECRET)}`;
}
export async function validUnsubscribe(env, id, supplied) {
    if (!/^[a-f0-9-]{36}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(supplied || '')) return false;
    const expected = await signature(id, env.NEWSLETTER_UNSUBSCRIBE_SECRET);
    let difference = 0; for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
    return difference === 0;
}
export function validEmail(value) {
    return typeof value === 'string' && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}
export async function rateLimit(env, ip) {
    const hour = new Date().toISOString().slice(0, 13);
    const bucket = await tokenHash(`${env.NEWSLETTER_UNSUBSCRIBE_SECRET}:${hour}:${ip}`);
    const result = await env.NEWSLETTER_DB.prepare('INSERT INTO newsletter_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count')
        .bind(bucket, new Date(Date.now() + 2 * 3600000).toISOString()).first();
    await env.NEWSLETTER_DB.prepare('DELETE FROM newsletter_rate_limits WHERE expires_at < ?').bind(nowISO()).run();
    return result.count <= 6;
}

const escape = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function preferencePage(title, body, status = 200) {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} — John Owolabi</title><script src="/writer-theme.js?v=20261025-1"></script><link rel="stylesheet" href="/styles.css?v=20261025-5"><link rel="stylesheet" href="/writer.css?v=20261025-2"></head><body class="writer-page"><main class="container"><header class="site-header"><h1><a class="site-title" href="/">John Owolabi</a></h1></header><h2>${escape(title)}</h2>${body}<p><a href="/thoughts">Read the latest thoughts →</a></p></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
