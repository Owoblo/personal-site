import { createSesCampaign } from './ses-outbox.mjs';
const NEWSLETTER_ID = 'news_1t11ckchjs9r2ram5x54qfhnxg';
const escape = (text) => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function planPostEmail(post, posts, now = new Date()) {
    // Keep a burst of publication from becoming a burst in a reader's inbox.
    const last = Math.max(0, ...posts.filter((item) => item.id !== post.id && item._newsletter?.mode === 'send')
        .map((item) => Date.parse(item._newsletter.scheduledFor || item._newsletter.requestedAt) || 0));
    const sendAt = Math.max(now.getTime(), last + 24 * 60 * 60 * 1000);
    const url = `https://johnowolabi.com/post/${post.slug}/`;
    return {
        status: 'pending', mode: 'send', requestId: crypto.randomUUID(), requestedAt: now.toISOString(), attempts: 0,
        ...(sendAt > now.getTime() ? { scheduledFor: new Date(sendAt).toISOString() } : {}),
        subject: post.title,
        body: `<!-- buttondown-editor-mode: fancy --><p>I’ve published a new thought.</p><h2>${escape(post.title)}</h2><p>${escape(post.excerpt)}</p><p><a href="${url}">Read the thought →</a></p><p>— John</p>`,
    };
}

async function readSource(env) {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/posts.json?ref=main`, { headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Cloudflare-Pages-Function',
    } });
    if (!response.ok) throw new Error('Could not check the saved email notification.');
    const file = await response.json();
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, '')), (character) => character.charCodeAt(0));
    return { sha: file.sha, posts: JSON.parse(new TextDecoder().decode(bytes)).posts };
}

async function recordState(env, postId, requestId, state) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await readSource(env);
        const post = latest.posts.find((item) => item.id === postId);
        if (!post || post._newsletter?.requestId !== requestId) return latest.posts;
        const posts = latest.posts.map((item) => item.id === postId ? { ...item, _newsletter: state } : item);
        const bytes = new TextEncoder().encode(JSON.stringify({ posts }, null, 2));
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/posts.json`, {
            method: 'PUT', headers: {
                Authorization: `token ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json',
                'User-Agent': 'Cloudflare-Pages-Function',
            },
            body: JSON.stringify({ message: 'Record publication email status', branch: 'main', sha: latest.sha, content: btoa(binary) }),
        });
        if (response.ok) return posts;
        if (response.status !== 409) throw new Error('The email status could not be recorded.');
    }
    throw new Error('The email status changed in another session. Refresh before retrying.');
}

export async function queuePostEmail(env, postId) {
    if (env.NEWSLETTER_SENDING_ENABLED !== 'true') throw new Error('Subscriber emails are paused until your branded sender is ready.');
    const latest = await readSource(env);
    const post = latest.posts.find((item) => item.id === postId);
    if (!post || post.status !== 'published' || !post._newsletter) throw new Error('This post has no publication email to send.');
    const state = post._newsletter;
    if (!['pending', 'failed'].includes(state.status)) return { state, posts: latest.posts };
    if (env.NEWSLETTER_PROVIDER === 'ses') {
        const next = await createSesCampaign(env, post);
        delete next.error; delete next.nextAttemptAt;
        return { state: next, posts: await recordState(env, post.id, state.requestId, next) };
    }
    if (!env.BUTTONDOWN_API_KEY) throw new Error('Buttondown is not connected.');
    try {
        const response = await fetch('https://api.buttondown.com/v1/emails', {
            method: 'POST', headers: {
                Authorization: `Token ${env.BUTTONDOWN_API_KEY}`, 'Content-Type': 'application/json',
                'Buttondown-Context': NEWSLETTER_ID, 'X-Idempotency-Key': state.requestId,
            },
            body: JSON.stringify({
                subject: state.subject, body: state.body, slug: `johnowolabi-post-${post.id}`,
                status: state.scheduledFor ? 'scheduled' : 'about_to_send',
                ...(state.scheduledFor ? { publish_date: state.scheduledFor } : {}),
                canonical_url: `https://johnowolabi.com/post/${post.slug}/`, archival_mode: 'disabled',
                should_trigger_pay_per_email_billing: false,
                metadata: { website: 'johnowolabi.com', post_id: String(post.id) },
            }),
        });
        if (!response.ok) throw new Error(`Buttondown could not queue the email (HTTP ${response.status}).`);
        const email = await response.json();
        if (!email.id) throw new Error('Buttondown did not return an email reference.');
        const next = { ...state, status: state.scheduledFor ? 'scheduled' : 'queued', emailId: email.id, queuedAt: new Date().toISOString(), attempts: (state.attempts || 0) + 1 };
        delete next.error;
        delete next.nextAttemptAt;
        return { state: next, posts: await recordState(env, post.id, state.requestId, next) };
    } catch (error) {
        const attempts = (state.attempts || 0) + 1;
        const delay = Math.min(6 * 60, 15 * 2 ** (attempts - 1)) * 60 * 1000;
        const failed = { ...state, status: 'failed', error: error.message, attempts, nextAttemptAt: new Date(Date.now() + delay).toISOString() };
        // A timeout may follow a successful queue operation. Retrying reuses the same provider key.
        try { return { state: failed, posts: await recordState(env, post.id, state.requestId, failed) }; }
        catch (_) { throw error; }
    }
}
