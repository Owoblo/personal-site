import {
  SITE,
  tokenHash,
  nowISO,
  preferencePage,
} from "../_lib/newsletter-store.mjs";
export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.NEWSLETTER_DB || !/^[a-f0-9-]{72}$/.test(token))
    return preferencePage(
      "This link isn’t valid",
      '<p><a href="/#subscribe">Request a new confirmation email</a></p>',
      400,
    );
  const now = nowISO();
  const result = await env.NEWSLETTER_DB.prepare(
    `UPDATE newsletter_contacts SET status='confirmed',confirmed_at=?,updated_at=?,source='website',legacy_id=NULL,confirmation_hash=NULL,confirmation_expires=NULL WHERE confirmation_hash=? AND confirmation_expires>? AND status IN ('pending','unsubscribed') RETURNING id`,
  )
    .bind(now, now, await tokenHash(token), now)
    .first();
  if (!result)
    return preferencePage(
      "This link has expired or was already used",
      '<p>If you already confirmed, you’re all set. Otherwise, request a new confirmation email.</p><p><a href="/#subscribe">Return to subscribe</a></p>',
      400,
    );
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${SITE}/subscribe?status=confirmed`,
      "Cache-Control": "no-store",
      "Set-Cookie":
        "john_newsletter=confirmed; Path=/; Max-Age=31536000; Secure; SameSite=Lax",
    },
  });
}
