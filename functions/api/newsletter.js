import { requireAdmin } from '../_lib/auth.js';
import { readPosts } from '../_lib/read-posts.mjs';
import { queuePostEmail } from '../_lib/post-email.mjs';
import { sesReady } from '../_lib/ses.mjs';

export async function onRequestGet(context) {
    const unauthorized = await requireAdmin(context);
    if (unauthorized) return unauthorized;
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const canSend = context.env.NEWSLETTER_SENDING_ENABLED === 'true' && (context.env.NEWSLETTER_PROVIDER !== 'ses' || sesReady(context.env));
    if (new URL(context.request.url).searchParams.get('capabilities') === '1') return Response.json({ canSend }, { headers });
    if (context.env.NEWSLETTER_PROVIDER === 'ses' && context.env.NEWSLETTER_DB) {
        const db = context.env.NEWSLETTER_DB;
        const { results: counts } = await db.prepare('SELECT status,COUNT(*) AS count FROM newsletter_contacts GROUP BY status').all();
        const count = status => counts.find(row => row.status === status)?.count || 0;
        const { results: campaigns } = await db.prepare(`SELECT c.id,c.subject,c.status,c.available_at,COUNT(d.contact_id) AS total,SUM(CASE WHEN d.status='submitted' THEN 1 ELSE 0 END) AS submitted,SUM(CASE WHEN d.status='failed' THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN d.status IN ('uncertain','sending') THEN 1 ELSE 0 END) AS uncertain FROM newsletter_campaigns c LEFT JOIN newsletter_deliveries d ON d.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 5`).all();
        return Response.json({ configured: sesReady(context.env), canSend, name: 'John Owolabi', provider: 'ses', notificationMode: 'publishing', automaticRetry: Boolean(context.env.NEWSLETTER_CRON_SECRET), confirmed: count('confirmed'), pending: count('pending'), undeliverable: count('bounced') + count('complained'),
            emails: campaigns.map(c => ({ subject: c.subject, status: `${c.status} · ${c.submitted || 0}/${c.total} submitted${c.failed ? ` · ${c.failed} need retry` : ''}${c.uncertain ? ` · ${c.uncertain} need a delivery check` : ''}`, publishDate: c.available_at })),
            failedCampaigns: campaigns.filter(c => c.failed > 0).map(c => ({id:c.id,title:c.subject})),
            deliveryChecks: campaigns.filter(c => c.uncertain > 0).map(c => ({id:c.id,title:c.subject})), pendingNotifications: [],
        }, { headers });
    }
    if (!context.env.BUTTONDOWN_API_KEY) return Response.json({ configured: false }, { headers });
    try {
        async function get(path, newsletterId) {
            const response = await fetch(`https://api.buttondown.com/v1/${path}`, { headers: {
                Authorization: `Token ${context.env.BUTTONDOWN_API_KEY}`,
                ...(newsletterId ? { 'Buttondown-Context': newsletterId } : {}),
            } });
            if (!response.ok) throw new Error(`Buttondown returned HTTP ${response.status}. Check the connection and API key permissions.`);
            return response.json();
        }
        const newsletters = await get('newsletters');
        const newsletter = newsletters.results.find((item) => item.username === 'johnowolabi');
        if (!newsletter) throw new Error('The johnowolabi newsletter was not found for this API key.');
        const results = await Promise.allSettled([
            get('subscribers?type=regular', newsletter.id),
            get('subscribers?type=unactivated', newsletter.id),
            get('subscribers?type=undeliverable', newsletter.id),
            get('external_feeds', newsletter.id),
            get('emails?ordering=-creation_date', newsletter.id),
            readPosts(context),
        ]);
        const values = results.map((result) => result.status === 'fulfilled' ? result.value : null);
        const feed = values[3]?.results.find((item) => item.url === 'https://johnowolabi.com/feed.xml');
        return Response.json({
            configured: true,
            canSend,
            name: newsletter.name,
            notificationMode: 'publishing',
            automaticRetry: Boolean(context.env.NEWSLETTER_CRON_SECRET),
            confirmed: values[0]?.count ?? null,
            pending: values[1]?.count ?? null,
            undeliverable: values[2]?.count ?? null,
            feed: feed ? { status: feed.status, behavior: feed.behavior, cadence: feed.cadence, lastChecked: feed.last_checked_date, error: feed.error, skipOldItems: feed.skip_old_items } : null,
            emails: values[4]?.results.slice(0, 5).map((email) => ({ subject: email.subject, status: email.status, publishDate: email.publish_date })) || [],
            pendingNotifications: (values[5]?.posts || []).filter((post) => post.status === 'published' && ['pending', 'failed'].includes(post._newsletter?.status))
                .map((post) => ({ id: post.id, title: post.title, status: post._newsletter.status, error: post._newsletter.error })),
            incomplete: results.some((result) => result.status === 'rejected'),
        }, { headers });
    } catch (error) {
        return Response.json({ configured: true, error: error.message }, { status: 502, headers });
    }
}

export async function onRequestPost(context) {
    const unauthorized = await requireAdmin(context);
    if (unauthorized) return unauthorized;
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    try {
        const { action, postId, campaignId } = await context.request.json();
        if (action === 'retry-campaign' && /^[a-f0-9-]{36}$/.test(campaignId || '') && context.env.NEWSLETTER_DB) {
            await context.env.NEWSLETTER_DB.batch([
                context.env.NEWSLETTER_DB.prepare("UPDATE newsletter_deliveries SET status='pending',attempts=0,next_attempt_at=NULL WHERE campaign_id=? AND status='failed'").bind(campaignId),
                context.env.NEWSLETTER_DB.prepare("UPDATE newsletter_campaigns SET status='processing' WHERE id=? AND status!='cancelled'").bind(campaignId),
            ]);
            return Response.json({ success: true }, { headers });
        }
        if (action !== 'retry' || !Number.isSafeInteger(postId)) return Response.json({ error: 'Invalid notification request' }, { status: 400, headers });
        const result = await queuePostEmail(context.env, postId);
        return Response.json({ notification: result.state, posts: result.posts }, { headers });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 502, headers });
    }
}
