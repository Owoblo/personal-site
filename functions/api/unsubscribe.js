import {
  nowISO,
  validUnsubscribe,
  preferencePage,
} from "../_lib/newsletter-store.mjs";
async function contact(context) {
  const url = new URL(context.request.url),
    id = url.searchParams.get("id"),
    token = url.searchParams.get("token");
  if (
    !context.env.NEWSLETTER_DB ||
    !(await validUnsubscribe(context.env, id, token))
  )
    return null;
  return context.env.NEWSLETTER_DB.prepare(
    "SELECT id,status FROM newsletter_contacts WHERE id=?",
  )
    .bind(id)
    .first();
}
function unsubscribed(title, body) {
  const response = preferencePage(title, body);
  response.headers.set(
    "Set-Cookie",
    "john_newsletter=; Path=/; Max-Age=0; Secure; SameSite=Lax",
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export async function onRequestGet(context) {
  const subscriber = await contact(context);
  if (!subscriber)
    return preferencePage(
      "This unsubscribe link isn’t valid",
      "<p>Use the unsubscribe link in the email you received, or reply to that email for help.</p>",
      400,
    );
  if (subscriber.status === "unsubscribed")
    return unsubscribed(
      "You’re already unsubscribed",
      '<p>You won’t receive any more thoughts by email.</p><p><a href="/#subscribe">Subscribe again</a></p>',
    );
  // Viewing a link never unsubscribes someone: mail scanners often open links.
  const prefs = await context.env.NEWSLETTER_DB.prepare(
    "SELECT archive_enabled FROM newsletter_preferences WHERE contact_id=?",
  )
    .bind(subscriber.id)
    .first();
  return preferencePage(
    "Your reading preferences",
    `<p>You can leave the list whenever you like, or manage earlier thoughts separately from new posts.</p><form method="post"><div class="actions"><button class="btn" type="submit">Unsubscribe from all emails</button><button class="btn" name="action" value="${prefs?.archive_enabled ? "archive-off" : "archive-on"}" type="submit">${prefs?.archive_enabled ? "Pause" : "Resume"} earlier thoughts</button></div></form>`,
  );
}
export async function onRequestPost(context) {
  const subscriber = await contact(context);
  if (!subscriber)
    return preferencePage(
      "This unsubscribe link isn’t valid",
      "<p>Use the link in the email you received.</p>",
      400,
    );
  const form = await context.request.formData().catch(() => null);
  if (["archive-off", "archive-on"].includes(form?.get("action"))) {
    if (subscriber.status !== "confirmed")
      return preferencePage(
        "Confirm your subscription first",
        '<p><a href="/#subscribe">Return to subscribe</a></p>',
        400,
      );
    const enabled = form.get("action") === "archive-on";
    await context.env.NEWSLETTER_DB.prepare(
      "INSERT INTO newsletter_preferences(contact_id,archive_enabled) VALUES (?,?) ON CONFLICT(contact_id) DO UPDATE SET archive_enabled=excluded.archive_enabled",
    )
      .bind(subscriber.id, enabled ? 1 : 0)
      .run();
    return preferencePage(
      enabled ? "Earlier thoughts are resumed" : "Earlier thoughts are paused",
      "<p>Your preference is saved. New posts remain part of your subscription.</p>",
    );
  }
  await context.env.NEWSLETTER_DB.prepare(
    "UPDATE newsletter_contacts SET status='unsubscribed',updated_at=?,confirmation_hash=NULL,confirmation_expires=NULL WHERE id=?",
  )
    .bind(nowISO(), subscriber.id)
    .run();
  return unsubscribed(
    "You’re unsubscribed",
    '<p>You won’t receive any more thoughts by email. Thanks for reading.</p><p><a href="/#subscribe">Subscribe again</a></p>',
  );
}
