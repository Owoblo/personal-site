# Cloudflare Pages Deployment

This repo deploys to Cloudflare Pages, with static site assets and Pages Functions for writing, the post feed, and live articles.

## Cloudflare Pages settings

- Production branch: `main`
- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`

## Required Pages secrets

- `OPENAI_API_KEY`
- `ADMIN_PASSWORD`
- `GITHUB_TOKEN`
- `GITHUB_REPO`

## Optional Pages secrets

- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_BUSINESS_ID`
- `CLOUDFLARE_DEPLOY_HOOK_URL` for an optional refresh of static pages, sitemap, and generated social images after saving
- `BUTTONDOWN_API_KEY` for publication announcements and the authenticated Email list tab
- `NEWSLETTER_CRON_SECRET` for the protected retry endpoint; use the same secret in the retry worker

## Important notes

- `_routes.json` enables Functions for `/api/*`, `/posts.json`, `/feed.xml`, and `/post/*`.
- The feed and live articles read the latest GitHub-backed post data. Publishing and editing an article do not depend on a deployment hook. Static article pages remain an availability fallback.
- Public feed requests return published posts. The authenticated writer can see drafts and archived posts. Draft article URLs return 404; archived posts remain accessible by direct URL.
- `functions/_lib/render-post.mjs` is the shared template used by static builds and live article requests. The writer's preview and public articles share `.post-body` styles.
- The editor ships Markdown and HTML conversion libraries locally, preserving semantic formatting across Writing and HTML source views.
- Save Draft persists to GitHub and can be reopened on another device. Local recovery separately protects unsaved work on the current device. Saves merge only the edited post and reject stale edits instead of overwriting another session's changes.
- Existing posts retain generated social images; new posts use the site's portrait until the next static build generates their image.
- The build script copies only publishable static assets into `dist/`, which prevents `node_modules` from being deployed during Git-based Pages builds.
- `analytics.js` no longer posts page views into GitHub. Use Cloudflare Web Analytics from the Pages dashboard.
- `analytics.html` now acts as a legacy snapshot view for `analytics.json`, not live traffic reporting.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in the secrets
3. Run `npm run build`
4. Run `npx wrangler pages dev dist`

Run `npm test` for the publishing, draft visibility, and concurrent editing regression checks.

## Publication emails

The existing Buttondown list remains the subscriber source. Native signup forms preserve its confirmation, CAPTCHA, error, and unsubscribe flows. Only confirmed subscribers receive announcements; setup does not reactivate pending addresses or send old articles.

When a draft first becomes published, the writer can select **Email readers when this goes live**. The site saves the article first, then creates a short Buttondown announcement linking to it. Saving drafts and editing previously published articles do not send email. Multiple new announcements are spaced at least 24 hours apart. The authenticated **Email list** tab shows subscriber counts, recent email status, and failed announcements with a retry action.

An outbox entry is stored with the source article. Provider requests reuse a stable idempotency key so a retry after a timeout does not deliberately create another announcement. Failed attempts back off, with up to eight automatic attempts; the writer can retry manually afterward. Queued/scheduled means Buttondown accepted the request, not that every reader received it. Internal outbox metadata is excluded from the public posts endpoint.

Deploy `workers/newsletter-cron/wrangler.toml` separately with Wrangler, then set its `NEWSLETTER_CRON_SECRET`. This worker checks the protected Pages endpoint every 15 minutes. It has no public worker URL and does not hold the Buttondown or GitHub keys. Deploy Pages with both production secrets before enabling the retry worker.

The public `/feed.xml` is a reader RSS feed, separate from email sending. This setup does not enable Buttondown's paid RSS, tagging, or automation add-ons. Default provider confirmation messages remain in place; custom transactional messages require a different Buttondown plan.

The optional signup redirect URLs are `https://johnowolabi.com/subscribe?status=pending` and `https://johnowolabi.com/subscribe?status=confirmed`. The site's confirmation page is informational; Buttondown verifies each address through its own confirmation link.

Run `npm test` for RSS filtering, outbox retries, cron authentication, and publishing/draft regression checks. Delivery can be checked using Buttondown's send-draft API with an explicit owner-only recipient, without broadcasting to subscribers.
