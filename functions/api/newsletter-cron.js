import { readPosts } from '../_lib/read-posts.mjs';
import { queuePostEmail } from '../_lib/post-email.mjs';
import { processSesOutbox } from '../_lib/ses-outbox.mjs';

function matches(secret, supplied) {
    if (!secret || secret.length < 32 || secret.length !== supplied.length) return false;
    let difference = 0;
    for (let index = 0; index < secret.length; index++) difference |= secret.charCodeAt(index) ^ supplied.charCodeAt(index);
    return difference === 0;
}

export async function onRequestPost(context) {
    const supplied = (context.request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!matches(context.env.NEWSLETTER_CRON_SECRET, supplied)) return new Response('Unauthorized', { status: 401 });
    if (context.env.NEWSLETTER_SENDING_ENABLED !== 'true') return Response.json({ paused: true, pending: 0, queued: 0, scheduled: 0, failed: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    const { posts } = await readPosts(context);
    const now = Date.now();
    const pending = posts.filter((post) => post.status === 'published' &&
        ['pending', 'failed'].includes(post._newsletter?.status) &&
        (post._newsletter.attempts || 0) < 8 &&
        (!post._newsletter.nextAttemptAt || Date.parse(post._newsletter.nextAttemptAt) <= now))
        .sort((a, b) => Date.parse(a._newsletter.requestedAt) - Date.parse(b._newsletter.requestedAt));
    const result = { pending: pending.length, queued: 0, scheduled: 0, failed: 0 };
    if (new URL(context.request.url).searchParams.get('dry_run') !== '1') {
        for (const post of pending.slice(0, 3)) {
            try {
                const queued = await queuePostEmail(context.env, post.id);
                if (queued.state.status === 'queued') result.queued++;
                else if (queued.state.status === 'scheduled') result.scheduled++;
                else result.failed++;
            } catch (_) { result.failed++; }
        }
        if (context.env.NEWSLETTER_PROVIDER === 'ses') {
            Object.assign(result, await processSesOutbox(context.env, posts));
        }
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
