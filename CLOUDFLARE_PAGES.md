# Cloudflare Pages deployment

This site uses static assets and Pages Functions for writing, current articles, RSS, and its own newsletter. Production is a direct-upload Pages project: pushing Git alone does not deploy the site.

## Deployment

- Production branch: `main`
- Build: `npm run build`
- Output: `dist`
- Deploy: `npx wrangler pages deploy dist --project-name personal-site --branch main`
- Newsletter schema: `npx wrangler d1 execute johnowolabi-newsletter --remote --file migrations/0001_newsletter.sql`
- Retry worker: `npx wrangler deploy --config workers/newsletter-cron/wrangler.toml`

The root `wrangler.toml` binds the private `NEWSLETTER_DB` database and selects the SES provider. Keep sending disabled during a new setup until the domain, credentials, subscription flow, and owner-only delivery test have been verified.

## Pages secrets

Writing: `ADMIN_PASSWORD`, `GITHUB_TOKEN`, `GITHUB_REPO`, and `OPENAI_API_KEY`.

Newsletter: `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION`, `NEWSLETTER_UNSUBSCRIBE_SECRET`, and `NEWSLETTER_CRON_SECRET`. Retain `BUTTONDOWN_API_KEY` for checking consent changes on migrated contacts; new signup and email sending use this site and SES. The unsubscribe signing secret must remain stable so old preference links continue working.

Optional integrations: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID`, and `CLOUDFLARE_DEPLOY_HOOK_URL`. No Instagram credentials are currently configured.

The retry worker holds only `NEWSLETTER_CRON_SECRET`, matching Pages. It calls the protected site endpoint and has no public Worker URL or subscriber database binding.

## Writing and publication

`/posts.json` and `/post/*` read the latest saved GitHub source. Publishing does not require a deployment hook. Static articles remain an availability fallback. Public feeds exclude drafts and internal email metadata; authenticated writers can reopen drafts. Draft URLs return 404 and archived articles remain accessible directly.

The shared article template and `.post-body` styles keep preview and live formatting aligned. Markdown/HTML libraries ship locally. Save Draft persists across devices; local recovery separately protects unsaved writing on the current device. Saves merge only the edited post and reject stale edits.

Published articles use branded social images. Saving writing triggers the social-card workflow; the `/og/` handler serves refreshed cards from GitHub, with deployed-image and JO fallbacks while a build runs. `_routes.json` enables the public article, feed, tracking, and image handlers as well as `/api/*`. Build output includes only publishable static assets.

## Branded email

SES sends as **John Owolabi <hello@johnowolabi.com>**, with replies to the same address. The SES identity and custom return path `bounce.johnowolabi.com` are verified in `us-east-2`. Public authentication records are documented in `ses-dns-records.json`. Cloudflare Email Routing forwards `hello@johnowolabi.com` to the owner's verified Gmail inbox. Composing as this address within Gmail requires its separate Send mail as configuration.

The site owns the signup, confirmation, and unsubscribe flows. New addresses stay pending until they follow the confirmation link. Tokens expire after 24 hours, are stored as hashes, and are cleared when used. Repeated confirmation requests are throttled by address and a short-lived hashed IP bucket. There is no third-party branding in the email templates or reader preference pages.

Unsubscribe links use an HMAC-signed contact ID. GET shows a confirmation page without changing consent, preventing link scanners from unsubscribing people. POST supports one-click unsubscribe without login. Consent is checked again before each publication email. SES's dedicated newsletter configuration set uses bounce and complaint suppression; suppressed addresses are skipped before sending.

The initial migration preserved 12 confirmed, 42 pending, and 2 undeliverable contacts. It sent no messages. Old-provider consent changes are still respected for migrated contacts; pending contacts are activated only after an actual confirmation. A new confirmation on this site becomes the contact's current consent source. No source writing or existing posts were changed by migration.

## Publication announcements

A first publication can request **Email readers when this goes live**. Draft saves and later edits never request another announcement. Multiple announcements are spaced at least 24 hours apart. The site saves the article first, then creates a durable campaign in D1. Current confirmed readers are snapshotted when a due campaign begins. New subscribers do not receive old publication campaigns; the separate optional reading sequence provides earlier thoughts at a daily pace.

A cron check runs every five minutes and processes up to five recipients per check. Each recipient has separate state and a send lease. Completed recipients are not resent. Definite failures back off and receive up to eight automatic attempts; the Email list tab provides retries for failed deliveries. A timeout or interrupted acknowledgement is held as uncertain and requires a delivery check before any retry, because SES SendEmail is not idempotent. The backend reports submitted messages, not guaranteed inbox delivery. Unpublished or replaced source articles cancel remaining campaign delivery.

The authenticated Email list tab shows subscriber counts, campaign progress, failed deliveries, and uncertain deliveries. All list data and per-recipient delivery records stay in D1, outside public assets and GitHub. The public RSS feed is separate from email delivery. No paid RSS, automation, branding, or tagging add-on was enabled.

## Analytics and social tools

`analytics.js` has legacy GitHub tracking disabled. `analytics.html` shows an old snapshot; first-party reading measurements are described in STUDIO.md. The existing carousel exporter provides editable slides and downloads. The private Thought studio now provides repurposing, voice/reference libraries, carousel exports, tracked links, and reader insights. Social account integrations remain unconnected. See STUDIO.md for setup and current limits.

## Development and verification

Copy `.dev.vars.example` to `.dev.vars`, fill in credentials, build, and use `npx wrangler pages dev dist`. Keep local email sending disabled unless deliberately testing against controlled addresses and a separate database.

Apply migrations/0002_studio.sql before deploying the studio and sequence features. Run `npm test` on Node 22.13 or newer for the publishing, draft, consent, template, and delivery-queue checks. Tests use an in-memory SQLite database and mocked external providers. Generate a non-sending email design preview with `node scripts/preview-newsletter.mjs`.

Live verification covered an owner-only branded confirmation, confirmation then unsubscribe, an email sent to hello@johnowolabi.com and forwarded into Gmail, and authenticated cron access. No existing subscriber received a setup broadcast.
