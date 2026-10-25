import { sendEmail, suppressionReason } from './ses.mjs';
import { renderBrandedEmail } from './branded-email.mjs';
import { nowISO, unsubscribeUrl } from './newsletter-store.mjs';

export async function createSesCampaign(env, post) {
    const state = post._newsletter, now = nowISO();
    await env.NEWSLETTER_DB.prepare(`INSERT OR IGNORE INTO newsletter_campaigns(id,post_id,subject,excerpt,article_url,available_at,created_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(state.requestId, post.id, state.subject, post.excerpt, `https://johnowolabi.com/post/${post.slug}/`, state.scheduledFor || now, now).run();
    return { ...state, provider: 'ses', status: state.scheduledFor ? 'scheduled' : 'queued', emailId: state.requestId, queuedAt: now, attempts: (state.attempts || 0) + 1 };
}

// Older provider emails can still contain its unsubscribe link. Respect changes
// there for migrated contacts until the owner explicitly confirms here again.
export async function syncLegacyPreferences(env) {
    const { results } = await env.NEWSLETTER_DB.prepare("SELECT id,legacy_id,status FROM newsletter_contacts WHERE legacy_id IS NOT NULL AND status IN ('confirmed','pending')").all();
    if (!results.length) return;
    if (!env.BUTTONDOWN_API_KEY) throw new Error('Legacy subscriber preferences cannot be checked.');
    const active = new Set(); let url = 'https://api.buttondown.com/v1/subscribers?type=regular';
    for (let page = 0; url && page < 20; page++) {
        if (new URL(url).origin !== 'https://api.buttondown.com') throw new Error('Invalid subscriber response.');
        const response = await fetch(url, { headers: { Authorization: `Token ${env.BUTTONDOWN_API_KEY}` } });
        if (!response.ok) throw new Error('Legacy subscriber preferences are temporarily unavailable.');
        const data = await response.json(); for (const contact of data.results || []) active.add(contact.id);
        url = data.next || null;
        if (url && page === 19) throw new Error('Subscriber preference check is incomplete.');
    }
    const updates = results.flatMap(contact => {
        if (contact.status === 'confirmed' && !active.has(contact.legacy_id)) return [env.NEWSLETTER_DB.prepare("UPDATE newsletter_contacts SET status='unsubscribed',updated_at=? WHERE id=? AND status='confirmed' AND legacy_id=?").bind(nowISO(), contact.id, contact.legacy_id)];
        if (contact.status === 'pending' && active.has(contact.legacy_id)) return [env.NEWSLETTER_DB.prepare("UPDATE newsletter_contacts SET status='confirmed',confirmed_at=?,updated_at=? WHERE id=? AND status='pending' AND legacy_id=?").bind(nowISO(), nowISO(), contact.id, contact.legacy_id)];
        return [];
    });
    if (updates.length) await env.NEWSLETTER_DB.batch(updates);
}

export async function processSesOutbox(env, publishedPosts, { limit = 5 } = {}) {
    const summary = { submitted: 0, failed: 0, uncertain: 0, skipped: 0 };
    if (env.NEWSLETTER_SENDING_ENABLED !== 'true') return { ...summary, paused: true };
    const db = env.NEWSLETTER_DB, now = nowISO();
    // A crashed request may already have sent. Never automatically resend it.
    await db.prepare("UPDATE newsletter_deliveries SET status='uncertain',error='Delivery acknowledgement was interrupted. Check SES before retrying.' WHERE status='sending' AND lease_until<?").bind(now).run();
    const { results: campaigns } = await db.prepare("SELECT * FROM newsletter_campaigns WHERE status IN ('pending','processing') AND available_at<=? ORDER BY available_at LIMIT 3").bind(now).all();
    if (!campaigns.length) return summary;
    await syncLegacyPreferences(env);
    let remaining = limit;
    for (const campaign of campaigns) {
        const post = publishedPosts.find(post => post.id === campaign.post_id && post._newsletter?.requestId === campaign.id && (post.status || 'published') === 'published');
        if (!post) { await db.prepare("UPDATE newsletter_campaigns SET status='cancelled' WHERE id=?").bind(campaign.id).run(); continue; }
        if (!campaign.initialized) await db.batch([
            db.prepare("INSERT OR IGNORE INTO newsletter_deliveries(campaign_id,contact_id) SELECT ?,id FROM newsletter_contacts WHERE status='confirmed' AND confirmed_at<=?").bind(campaign.id, campaign.created_at),
            db.prepare("UPDATE newsletter_campaigns SET initialized=1,status='processing' WHERE id=?").bind(campaign.id),
        ]);
        const { results: deliveries } = await db.prepare(`SELECT d.contact_id,c.email,c.status AS contact_status FROM newsletter_deliveries d JOIN newsletter_contacts c ON c.id=d.contact_id WHERE d.campaign_id=? AND d.status IN ('pending','failed') AND d.attempts<8 AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=?) LIMIT ?`).bind(campaign.id, now, remaining).all();
        for (const delivery of deliveries) {
            const lease = new Date(Date.now() + 10 * 60000).toISOString();
            const claimed = await db.prepare("UPDATE newsletter_deliveries SET status='sending',lease_until=?,attempts=attempts+1 WHERE campaign_id=? AND contact_id=? AND status IN ('pending','failed') AND attempts<8 AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING attempts")
                .bind(lease, campaign.id, delivery.contact_id, now).first();
            if (!claimed) continue;
            remaining--;
            const contact = await db.prepare('SELECT status FROM newsletter_contacts WHERE id=?').bind(delivery.contact_id).first();
            if (contact?.status !== 'confirmed') {
                await db.prepare("UPDATE newsletter_deliveries SET status='skipped',error=NULL WHERE campaign_id=? AND contact_id=?").bind(campaign.id, delivery.contact_id).run(); summary.skipped++; continue;
            }
            try {
                const reason = await suppressionReason(env, delivery.email);
                if (reason) {
                    await db.batch([
                        db.prepare('UPDATE newsletter_contacts SET status=?,updated_at=? WHERE id=?').bind(reason === 'COMPLAINT' ? 'complained' : 'bounced', nowISO(), delivery.contact_id),
                        db.prepare("UPDATE newsletter_deliveries SET status='skipped',error='Address suppressed by mail service.' WHERE campaign_id=? AND contact_id=?").bind(campaign.id, delivery.contact_id),
                    ]); summary.skipped++; continue;
                }
            } catch (_) {
                await db.prepare("UPDATE newsletter_deliveries SET status='failed',error='Could not check address suppression.',next_attempt_at=? WHERE campaign_id=? AND contact_id=?").bind(new Date(Date.now() + 15 * 60000).toISOString(), campaign.id, delivery.contact_id).run(); summary.failed++; continue;
            }
            let accepted = false;
            try {
                const unsubscribe = await unsubscribeUrl(env, delivery.contact_id);
                const message = renderBrandedEmail({ title: campaign.subject, excerpt: campaign.excerpt, articleUrl: `https://johnowolabi.com/post/${post.slug}/`, unsubscribeUrl: unsubscribe });
                const messageId = await sendEmail(env, { to: delivery.email, subject: campaign.subject, ...message, unsubscribeUrl: unsubscribe, tags: [{ Name: 'campaign', Value: campaign.id }] });
                accepted = true;
                await db.prepare("UPDATE newsletter_deliveries SET status='submitted',message_id=?,sent_at=?,error=NULL,next_attempt_at=NULL WHERE campaign_id=? AND contact_id=?").bind(messageId, nowISO(), campaign.id, delivery.contact_id).run(); summary.submitted++;
            } catch (error) {
                const uncertain = accepted || error.uncertain;
                const status = uncertain ? 'uncertain' : 'failed';
                const delay = Math.min(360, 15 * 2 ** (claimed.attempts - 1));
                await db.prepare('UPDATE newsletter_deliveries SET status=?,error=?,next_attempt_at=? WHERE campaign_id=? AND contact_id=?').bind(status, uncertain ? 'Delivery may have succeeded. Check SES before retrying.' : error.message, new Date(Date.now() + delay * 60000).toISOString(), campaign.id, delivery.contact_id).run();
                summary[uncertain ? 'uncertain' : 'failed']++;
            }
        }
        const counts = await db.prepare("SELECT SUM(CASE WHEN status IN ('pending','sending') OR (status='failed' AND attempts<8) THEN 1 ELSE 0 END) AS waiting,SUM(CASE WHEN status IN ('uncertain','failed') THEN 1 ELSE 0 END) AS attention FROM newsletter_deliveries WHERE campaign_id=?").bind(campaign.id).first();
        await db.prepare('UPDATE newsletter_campaigns SET status=? WHERE id=?').bind(counts.waiting ? 'processing' : counts.attention ? 'attention' : 'complete', campaign.id).run();
        if (remaining <= 0) break;
    }
    return summary;
}
