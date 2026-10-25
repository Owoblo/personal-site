import { nowISO, validUnsubscribe, preferencePage } from '../_lib/newsletter-store.mjs';
async function contact(context) {
    const url = new URL(context.request.url), id = url.searchParams.get('id'), token = url.searchParams.get('token');
    if (!context.env.NEWSLETTER_DB || !await validUnsubscribe(context.env, id, token)) return null;
    return context.env.NEWSLETTER_DB.prepare('SELECT id,status FROM newsletter_contacts WHERE id=?').bind(id).first();
}
export async function onRequestGet(context) {
    const subscriber = await contact(context);
    if (!subscriber) return preferencePage('This unsubscribe link isn’t valid', '<p>Use the unsubscribe link in the email you received, or reply to that email for help.</p>', 400);
    if (subscriber.status === 'unsubscribed') return preferencePage('You’re already unsubscribed', '<p>You won’t receive any more thoughts by email.</p><p><a href="/#subscribe">Subscribe again</a></p>');
    // Viewing a link never unsubscribes someone: mail scanners often open links.
    return preferencePage('Unsubscribe from my thoughts?', '<p>You can leave the list whenever you like.</p><form method="post"><button class="btn" type="submit">Unsubscribe</button></form>');
}
export async function onRequestPost(context) {
    const subscriber = await contact(context);
    if (!subscriber) return preferencePage('This unsubscribe link isn’t valid', '<p>Use the link in the email you received.</p>', 400);
    await context.env.NEWSLETTER_DB.prepare("UPDATE newsletter_contacts SET status='unsubscribed',updated_at=?,confirmation_hash=NULL,confirmation_expires=NULL WHERE id=?").bind(nowISO(), subscriber.id).run();
    return preferencePage('You’re unsubscribed', '<p>You won’t receive any more thoughts by email. Thanks for reading.</p><p><a href="/#subscribe">Subscribe again</a></p>');
}
