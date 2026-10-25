import { sendEmail, sesReady } from "../_lib/ses.mjs";
import { renderConfirmationEmail } from "../_lib/branded-email.mjs";
import {
  SITE,
  nowISO,
  randomToken,
  tokenHash,
  validEmail,
  rateLimit,
  preferencePage,
} from "../_lib/newsletter-store.mjs";

function accepted(request) {
  if (request.headers.get("Accept")?.includes("application/json"))
    return Response.json(
      {
        success: true,
        status: "pending",
        message:
          "Check your inbox to confirm. If you already confirmed, you’re all set. If the email hasn’t arrived, check spam or promotions.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  return Response.redirect(`${SITE}/subscribe?status=pending`, 303);
}
function failure(request, title, message, status) {
  if (request.headers.get("Accept")?.includes("application/json"))
    return Response.json(
      { success: false, message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  return preferencePage(
    title,
    `<p>${message}</p><p><a href="/#subscribe">Return to subscribe</a></p>`,
    status,
  );
}
export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Invalid origin", { status: 403 });
  if (!sesReady(env) || env.NEWSLETTER_SENDING_ENABLED !== "true")
    return failure(
      request,
      "Subscriptions will be back shortly",
      "I’m making a few improvements to the email list. Please try again soon.",
      503,
    );
  try {
    if (Number(request.headers.get("Content-Length")) > 4096)
      return new Response("Too large", { status: 413 });
    const form = await request.formData();
    if (form.get("website")) return accepted(request);
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    if (!validEmail(email))
      return failure(
        request,
        "Check your email address",
        "Please enter a valid email address.",
        400,
      );
    if (
      !(await rateLimit(
        env,
        request.headers.get("CF-Connecting-IP") || "unknown",
      ))
    )
      return failure(
        request,
        "Please try again a little later",
        "There have been several requests. Wait a while before trying again.",
        429,
      );
    const db = env.NEWSLETTER_DB;
    const existing = await db
      .prepare("SELECT * FROM newsletter_contacts WHERE email=?")
      .bind(email)
      .first();
    if (
      existing?.status === "confirmed" ||
      ["bounced", "complained"].includes(existing?.status) ||
      (existing?.confirmation_sent_at &&
        Date.parse(existing.confirmation_sent_at) > Date.now() - 15 * 60000)
    )
      return accepted(request);
    const token = randomToken(),
      hash = await tokenHash(token),
      id = existing?.id || crypto.randomUUID(),
      now = nowISO();
    const stored = await db
      .prepare(
        `INSERT INTO newsletter_contacts(id,email,status,source,created_at,updated_at,confirmation_hash,confirmation_expires,confirmation_sent_at) VALUES (?,?,'pending','website',?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET confirmation_hash=excluded.confirmation_hash,confirmation_expires=excluded.confirmation_expires,confirmation_sent_at=excluded.confirmation_sent_at,updated_at=excluded.updated_at WHERE newsletter_contacts.status IN ('pending','unsubscribed') AND (newsletter_contacts.confirmation_sent_at IS NULL OR newsletter_contacts.confirmation_sent_at<?) RETURNING id`,
      )
      .bind(
        id,
        email,
        now,
        now,
        hash,
        new Date(Date.now() + 24 * 3600000).toISOString(),
        now,
        new Date(Date.now() - 15 * 60000).toISOString(),
      )
      .first();
    if (!stored) return accepted(request);
    await db
      .prepare(
        "INSERT INTO newsletter_preferences(contact_id,archive_enabled,sequence_floor) VALUES (?,?,'1970-01-01') ON CONFLICT(contact_id) DO UPDATE SET archive_enabled=excluded.archive_enabled,sequence_floor=excluded.sequence_floor",
      )
      .bind(stored.id, form.get("archive") === "1" ? 1 : 0)
      .run();
    const attribution = String(form.get("attribution_link") || "");
    if (
      /^[a-f0-9-]{36}$/.test(attribution) &&
      (await db
        .prepare("SELECT id FROM studio_links WHERE id=?")
        .bind(attribution)
        .first())
    )
      await db
        .prepare(
          "INSERT OR IGNORE INTO newsletter_attribution(contact_id,link_id,created_at) VALUES (?,?,?)",
        )
        .bind(stored.id, attribution, now)
        .run();
    const message = renderConfirmationEmail(
      `${SITE}/api/confirm-subscription?token=${encodeURIComponent(token)}`,
    );
    try {
      await sendEmail(env, {
        to: email,
        subject: "Confirm your subscription — John Owolabi",
        ...message,
      });
    } catch (error) {
      await db
        .prepare(
          "UPDATE newsletter_contacts SET confirmation_sent_at=NULL WHERE id=? AND confirmation_hash=?",
        )
        .bind(stored.id, hash)
        .run();
      return failure(
        request,
        "The confirmation email couldn’t be sent",
        "The confirmation email couldn’t be sent. Please try again shortly.",
        503,
      );
    }
    return accepted(request);
  } catch (_) {
    return failure(
      request,
      "Please try again shortly",
      "The email list is temporarily unavailable. Please try again shortly.",
      503,
    );
  }
}
