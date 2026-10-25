# Thought studio

Open `/studio` with the existing Writer's room password. The source essay, adaptations, saved voice guide, references, and analytics remain separate. Studio data is private in D1.

## Using it

1. Choose an existing thought, including a private draft, and an angle.
2. Choose carousel, short X post, X thread, LinkedIn, Facebook, or video script.
3. Draft with the existing OpenAI connection or start from the original. AI results are always drafts. The configured default is the existing `gpt-4o-mini`; `REPURPOSE_MODEL` can change the provider-specific model later. No additional model subscription was purchased.
4. Edit, save, and approve. Source changes mark adaptations stale and prevent approval until a fresh adaptation is created. Saves reject stale revisions and preserve previous versions. Local recovery protects unsaved editing; remote saves reopen across devices.
5. Export PNG slides as one ZIP, a content pack as JSON, or copy writing. The original article is never rewritten by repurposing.
6. Create a reading link for the intended channel. Record the eventual platform URL and measurements on the adaptation until account integrations are connected.

The voice guide contains style principles, exclusions, corrections, a reading invitation, and up to five selected examples. Reference URLs are saved as inspiration without fetching, copying, or executing the referenced content.

Six starter carousel drafts use excerpts from three existing essays, in type-only and photograph layouts. The photograph starters use the site's already-public portrait. New uploaded photos remain private in the draft until the owner exports or publishes them.

## Carousel defaults

- 2160 × 2700 lossless PNG exports, 4:5, Georgia/serif and the site's warm light/dark palettes.
- A concise opening, one idea per slide, approximately 25–50 words per middle slide, and an invitation to read and subscribe.
- Small JO/name/website branding and page numbers. No patterns, gradients, shadows, or automatic posting.
- Photo layout places a photograph on the cover and occasional intermediate slides. The ending stays typographic.
- Export checks measured text height and word count. Long slides must be split or edited; content is not silently cropped from an approved export.

These are starting templates, not a claim about what a platform's algorithm prefers. Compare a few real essays and keep the corrections that make the output sound like John.

## Identity and measurements

Existing thoughts use `thought-<post id>`. New writing receives a server-owned UUID, retained through edits and slug changes. Adaptations and reading links get separate IDs. Adaptation revisions, link revisions, and manual platform measurements preserve the connection to the version that was shared.

Reading links under `/r/` point only to this site and attach channel, thought, and adaptation attribution. HEAD requests, common previews, and known bots do not increment link requests. Security scanners may still appear, so these counts are not labeled as verified humans.

Article measurements start at this deployment: ephemeral navigation IDs, visible/focused reading time, and 25/50/75/100% depth. Updates are monotonic and deduplicated. Authenticated owner visits, common bots, DNT, and Global Privacy Control are excluded. Referrers retain only the hostname. No raw IP or screen recording is stored. Raw reading sessions expire after 90 days.

Email deliveries get their own reading links and an image-based open signal. Open counts are estimates because mail clients can preload, cache, or block images. Confirmed signup attribution follows a reading link within the same browser session. Platform views, likes, saves, and shares remain explicitly manual until the platform account is connected.

## Email sequence

The Email sequence view previews eligible readers and allows enabling/pausing catch-up. Existing confirmed readers begin with writing dated after they joined. New subscribers can select the earlier archive on the signup form. Unsubscribe preferences can pause earlier writing while retaining new posts.

The worker processes new publications first, queues catch-up separately, checks consent before sending, enforces at most one thought per reader per 24 hours, and skips already-submitted or uncertain copies of the same thought. Pending, unsubscribed, bounced, and complained contacts do not enter the reading sequence. Per-reader leases prevent parallel sends from bypassing the daily pace.

A separate one-time confirmation reminder is available for pending subscriptions between 3 and 180 days old. Starting reminders selects the current cohort; later signups do not silently join that batch. The studio can pause reminders. A reminder does not activate the contact; only following the confirmation link does. Its send marker is claimed before the provider call so an ambiguous timeout does not trigger another automatic reminder. Very old pending subscriptions remain dormant.

## Social link previews

`social-cards.yml` regenerates published PNG preview cards when writing is saved. It uses the repository's built-in workflow token and commits only image files. It does not edit source writing or require the Cloudflare DNS token. The `/og/` handler reads refreshed cards from GitHub, with deployed-image and JO fallbacks while a new card builds. Draft cards are unavailable publicly.

## Connections still required

- Instagram/Facebook, X, LinkedIn, and TikTok require their own account authorization and supported publishing/insight permissions before automatic posting or metric collection. No social posts have been sent by this implementation. DM aggregation also depends on each platform's API access.
- Search Console data requires access to the verified search property. The current reader dashboard contains the site's own measurements.
- Gmail Send mail as uses the already-verified SES SMTP settings in the owner's private local file, outside this repository. Reply from the same address and the alias reply-to should both be configured. Google has announced third-party Send as retirement for January 2027.
- The JO image is included in email bodies and available as a profile asset. The outlined sender-logo SVG is hosted under `/brand/jo-bimi.svg`. Gmail's inbox avatar still requires certificate issuance and DMARC enforcement; see BIMI_SETUP.md. No certificate was purchased or inbox-avatar activation claimed.

Detailed account requirements and provider restrictions are recorded in SOCIAL_CONNECTIONS.md. Three editable carousel test drafts for “You Don't Lose Everyone at Once” compare a light eight-slide journal, a shorter dark six-slide sequence, and an eight-slide mixed version alternating light and dark. The Mixed export palette is available for any carousel and starts light on slide one. Photo starters require the owner's own uploaded photograph; the design-reference screenshot is not a content photograph.

## Operations

Apply `migrations/0002_studio.sql` before deploying these Functions. It contains only additive `CREATE TABLE IF NOT EXISTS` statements. The existing private `NEWSLETTER_DB` binding is reused. `npm test` includes isolated SQLite tests for permissions, source preservation, stale saves, attribution, consent, and paced delivery. Browser verification covers desktop/mobile, both themes, actual PNG/ZIP downloads, and reopening saved work.

## Reading cards and signup invitations

The Reading card layout centres fuller passages vertically, with John Owolabi at the top left, a palette switch mark at the top right, and a page count below. JO appears in the footer. The switch mark follows each slide’s palette; export palette controls remain interactive in the studio. It supports light, dark and alternating palettes. Reading cards aim for 60–100 body words; measured height still gates export and approval in the editor. Other layouts retain shorter slide pacing. The redundant “A thought by” header has been removed from all layouts.

The public signup box appears after Thoughts on the homepage, at the end of each article, and on the writing index. Native form submission still works without JavaScript. The enhanced form keeps readers on the page, supports email autofill, retains the address on errors, and explains inbox confirmation without disclosing an address’s existing subscription status. The old article loader now uses the owned signup endpoint too.

A small reading invitation can appear after 30 seconds of visible, focused reading and meaningful progress. It does not open a modal or take focus. Dismissal suppresses it for seven days on that browser, as does a recent signup request. A confirmed subscription is recognised by a first-party, non-identifying UI cookie set after actual confirmation; unsubscribe clears it. This does not identify an existing subscriber on every device. No email address is stored in browser storage. The signup form remains available to readers who disable JavaScript.

Carousel headers use upright Georgia for the name. Short journal passages are centred in the available reading area, with a clear gap below the header. A final reading-card paragraph inviting readers to johnowolabi.com is separated by space and a short divider, then set in bold.

## Full reading library

`scripts/export-reading-library.mjs` creates a local library for every source thought (including clearly labelled private drafts), with searchable previews, per-thought PNG ZIPs, captions, and an import manifest. Run with `PLAYWRIGHT_MODULE` pointing to an installed Playwright package, and optionally `--output <directory>` or `--published-only`. Chrome can be selected through `CHROME_EXECUTABLE`. The output directory must be outside the website repository. No private writing is added to static deployment assets.

Each paragraph is split with word-preserving boundaries and packed using actual canvas text measurements. The source word sequence is checked before adding the closing invitation. Stable adaptation IDs use the source hash so a repeat export does not overwrite a hand-edited draft. Existing original writing is unchanged. The editor can open a saved adaptation directly with `?post=<id>&asset=<uuid>`.

Text and graphics render directly at twice the layout density for 2160 × 2700 PNGs; browser previews use a lighter canvas. Download the original PNGs for posting. The local detail view offers an Original PNG link for inspecting a full-resolution file.
