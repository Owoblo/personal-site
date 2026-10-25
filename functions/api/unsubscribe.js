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
    return preferencePage('Your reading preferences', '<p>You can leave the list whenever you like, or pause earlier thoughts and keep new posts.</p><form method="post"><div class="actions"><button class="btn" type="submit">Unsubscribe from all emails</button><button class="btn" name="action" value="archive-off" type="submit">Pause earlier thoughts</button></div></form>');
}
export async function onRequestPost(context) {
    const subscriber = await contact(context);
    if (!subscriber) return preferencePage('This unsubscribe link isn’t valid', '<p>Use the link in the email you received.</p>', 400);
    const form=await context.request.formData().catch(()=>null);
    if(form?.get('action')==='archive-off'){await context.env.NEWSLETTER_DB.prepare("INSERT INTO newsletter_preferences(contact_id,archive_enabled) VALUES (?,0) ON CONFLICT(contact_id) DO UPDATE SET archive_enabled=0").bind(subscriber.id).run();return preferencePage('Earlier thoughts are paused','<p>You’ll still receive new thoughts. You can unsubscribe completely using the link in any email.</p>')}
    await context.env.NEWSLETTER_DB.prepare("UPDATE newsletter_contacts SET status='unsubscribed',updated_at=?,confirmation_hash=NULL,confirmation_expires=NULL WHERE id=?").bind(nowISO(), subscriber.id).run();
    return preferencePage('You’re unsubscribed', '<p>You won’t receive any more thoughts by email. Thanks for reading.</p><p><a href="/#subscribe">Subscribe again</a></p>');
}
