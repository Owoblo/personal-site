import { sendEmail, sesReady } from '../_lib/ses.mjs';
import { renderConfirmationEmail } from '../_lib/branded-email.mjs';
import { SITE, nowISO, randomToken, tokenHash, validEmail, rateLimit, preferencePage } from '../_lib/newsletter-store.mjs';

export async function onRequestPost(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 });
    if (!sesReady(env) || env.NEWSLETTER_SENDING_ENABLED !== 'true') return preferencePage('Subscriptions will be back shortly', '<p>I’m making a few improvements to the email list. Please try again soon.</p>', 503);
    try {
        if (Number(request.headers.get('Content-Length')) > 4096) return new Response('Too large', { status: 413 });
        const form = await request.formData();
        if (form.get('website')) return Response.redirect(`${SITE}/subscribe?status=pending`, 303);
        const email = String(form.get('email') || '').trim().toLowerCase();
        if (!validEmail(email)) return preferencePage('Check your email address', '<p>Please enter a valid email address.</p><p><a href="/#subscribe">Try again</a></p>', 400);
        if (!await rateLimit(env, request.headers.get('CF-Connecting-IP') || 'unknown')) return preferencePage('Please try again a little later', '<p>There have been several requests. Wait a while before trying again.</p>', 429);
        const db = env.NEWSLETTER_DB;
        const existing = await db.prepare('SELECT * FROM newsletter_contacts WHERE email=?').bind(email).first();
        if (existing?.status === 'confirmed' || ['bounced', 'complained'].includes(existing?.status) || (existing?.confirmation_sent_at && Date.parse(existing.confirmation_sent_at) > Date.now() - 15 * 60000)) return Response.redirect(`${SITE}/subscribe?status=pending`, 303);
        const token = randomToken(), hash = await tokenHash(token), id = existing?.id || crypto.randomUUID(), now = nowISO();
        const stored = await db.prepare(`INSERT INTO newsletter_contacts(id,email,status,source,created_at,updated_at,confirmation_hash,confirmation_expires,confirmation_sent_at) VALUES (?,?,'pending','website',?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET confirmation_hash=excluded.confirmation_hash,confirmation_expires=excluded.confirmation_expires,confirmation_sent_at=excluded.confirmation_sent_at,updated_at=excluded.updated_at WHERE newsletter_contacts.status IN ('pending','unsubscribed') AND (newsletter_contacts.confirmation_sent_at IS NULL OR newsletter_contacts.confirmation_sent_at<?) RETURNING id`)
            .bind(id, email, now, now, hash, new Date(Date.now() + 24 * 3600000).toISOString(), now, new Date(Date.now() - 15 * 60000).toISOString()).first();
        if (!stored) return Response.redirect(`${SITE}/subscribe?status=pending`, 303);
        const message = renderConfirmationEmail(`${SITE}/api/confirm-subscription?token=${encodeURIComponent(token)}`);
        try { await sendEmail(env, { to: email, subject: 'Confirm your subscription — John Owolabi', ...message }); }
        catch (error) {
            await db.prepare('UPDATE newsletter_contacts SET confirmation_sent_at=NULL WHERE id=? AND confirmation_hash=?').bind(stored.id, hash).run();
            return preferencePage('The confirmation email couldn’t be sent', '<p>Please try again shortly.</p><p><a href="/#subscribe">Return to subscribe</a></p>', 503);
        }
        return Response.redirect(`${SITE}/subscribe?status=pending`, 303);
    } catch (_) { return preferencePage('Please try again shortly', '<p>The email list is temporarily unavailable.</p>', 503); }
}
