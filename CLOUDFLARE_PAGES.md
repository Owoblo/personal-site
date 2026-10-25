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

## Important notes

- `_routes.json` enables Functions for `/api/*`, `/posts.json`, and `/post/*`.
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
