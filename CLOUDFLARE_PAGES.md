# Cloudflare Pages Deployment

This repo is ready to deploy as a static Cloudflare Pages project with Pages Functions under `/api/*`.

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

## Important notes

- `_routes.json` restricts Functions execution to `/api/*` so the rest of the site stays static-first.
- The build script copies only publishable static assets into `dist/`, which prevents `node_modules` from being deployed during Git-based Pages builds.
- `analytics.js` no longer posts page views into GitHub. Use Cloudflare Web Analytics from the Pages dashboard.
- `analytics.html` now acts as a legacy snapshot view for `analytics.json`, not live traffic reporting.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in the secrets
3. Run `npm run build`
4. Run `npx wrangler pages dev dist`
