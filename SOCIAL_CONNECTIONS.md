# Connecting John's social accounts

Current decision: John will finish and schedule Instagram posts directly in the mobile app. Prioritize easy preparation: ordered high-resolution carousel images, exact caption copying, a saved music note and a downloadable posting guide. The studio's Download posting pack action provides these together. Do not enable automatic social publishing, create a social cron, or send Gmail handoff jobs as part of this manual workflow. The email newsletter cron is separate and stays in place. Earlier integration research below is retained for a later phase.

Muse reports that its Meta connector is connected to @johnowolabi_ and can publish a seven-image carousel, but cannot attach music. It stopped without publishing. These are user-provided Muse results; the website has no direct connection to that Muse session or connector.

No accounts are connected or posting automatically. First connection scope is Instagram, X, and TikTok. The site currently links to Instagram `johnowolabi_` and X `johnowolabi_`; John's screenshot identifies TikTok as `john.owolabi`, and he confirms Instagram is professional. Verify the exact signed-in identities during authorization. Facebook and LinkedIn are deferred. Use account authorization rather than sending passwords. Store API credentials only as encrypted backend secrets. Keep any experimental browser session in a private local profile outside the repository; never expose cookies or tokens in source, public assets, logs, or Git.

## Free publishing research — 25 October 2026

Research completed; the options below have not been installed, connected, or live-tested on John's accounts. AI can draft, select excerpts, and help maintain adapters, but it does not itself supply a platform's publishing authorization. Deterministic publishing avoids a model call for every browser action. Existing AI generation, electricity, storage, and any always-on hosting are separate costs from scheduler software.

### Practical starting recommendation

Keep the studio and reviewed queue as the source of truth, with replaceable publishing adapters. Start with a free authorized bridge where it handles the required format, and test a local browser worker for actual gaps before selecting it for unattended publishing. Do not install a second content management stack just to duplicate the studio.

Buffer Free currently covers three channels, ten pending posts per channel, one API key and 3,000 API requests per month. Ten is queue capacity, not a monthly publishing allowance: published posts release slots. X permits one scheduled thread at a time on Free, with up to 25 sub-posts in a thread. Our studio can retain the backlog and enqueue the next reviewed thread after the previous one publishes; do not submit replies as unrelated tweets to work around thread handling.

Sources: [Buffer pricing](https://buffer.com/pricing), [queue capacity](https://support.buffer.com/articles/how-many-posts-can-i-schedule-in-advance-Kmy2IEecqm), [X threads](https://support.buffer.com/articles/using-xtwitter-with-buffer-nA84XnWtuU).

### Open-source alternatives inspected

| Project | Actual approach | Fit and unresolved work |
| --- | --- | --- |
| [Postiz](https://github.com/gitroomhq/postiz-app) | Self-hosted scheduler with platform integrations | Useful reference, but self-hosting still requires provider credentials/apps, hosting and any platform API charges. It does not automatically remove X billing or TikTok review requirements. |
| [Twikit](https://github.com/d60/twikit) | Unofficial X internal API; README demonstrates tweet creation and media upload without a developer API key | Experimental candidate for singles and reply-linked threads. Open 2026 issues include posting rejection and login/rate-limit failures; not proven reliable for John's account. |
| [instagrapi](https://github.com/subzeroid/instagrapi) | Unofficial Instagram mobile/web APIs with saved authenticated sessions | Supports albums and other media, but private-API session handling and challenges add maintenance. Prefer the professional-account official route where available. |
| [tiktok-uploader](https://github.com/wkaisertexas/tiktok-uploader) | Playwright-controlled TikTok browser with account cookies | Documents videos, captions and scheduling. No verified photo-carousel path in the inspected README; do not label our reading-card sets as supported. |
| [auto-instagram](https://github.com/xtea/auto-instagram) | Browser-driven feed/carousel/Reel publishing, local queue and preview-only mode | Alpha. The author explicitly documents terms/account risk and selector maintenance. A reference for workflow design, not an approved production dependency. |

Primary evidence: [Postiz provider setup](https://docs.postiz.com/self-host/providers/overview), [Postiz Instagram roles/review](https://docs.postiz.com/self-host/providers/instagram), [Twikit posting failure](https://github.com/d60/twikit/issues/413), [TikTok uploader issues](https://github.com/wkaisertexas/tiktok-uploader/issues), [auto-instagram README](https://github.com/xtea/auto-instagram#readme).

Reddit inspiration: a commenter in [this n8n discussion](https://www.reddit.com/r/n8n/comments/1g1a0ue/automate_tiktok_upload_with_n8n/) reports using AI to adapt the TikTok uploader into a local service without paying a publishing service. This is an anecdote, not an independently verified reliability result. The [Postiz self-hosting discussion](https://www.reddit.com/r/selfhosted/comments/1hr00zc/postiz_v1191_open_source_social_media_scheduling/) is useful for open-source scheduling patterns. Verify technical capabilities against maintainers/platform documentation rather than Reddit claims.

### Formats matter for this library

- Buffer currently documents a ten-image maximum for Instagram and TikTok. Longer reading sets need a separately reviewed excerpt or multi-part adaptation; never silently drop cards, shrink text, or alter an approved set.
- Buffer's TikTok image path converts PNG to JPG and documents smaller delivery dimensions than our 2160 × 2700 masters. Preserve the original masters and inspect a platform-sized export before the first live carousel; no claim that any social platform preserves PNGs byte-for-byte.
- Calm music selected from native IG/TikTok libraries can require finishing in the mobile app. Browser automation or an AI agent does not guarantee access to native music features.
- TikTok's official photo API supports up to 35 images, but unaudited Direct Post clients are private-only. That larger API limit does not establish support in a third-party uploader or remove the audit restrictions.
- Posting permissions do not automatically provide all analytics or DMs. Buffer API metrics are experimental, and its API does not expose comment reading/replies. Keep our thought/adaptation IDs and tracked source links independent of the publishing provider.

Sources: [Buffer media limits](https://support.buffer.com/en-us/articles/attaching-images-videos-and-other-media-to-your-posts-eudySt0TnS), [TikTok delivery formats](https://support.buffer.com/articles/using-tiktok-with-buffer-oGEroY9Of2), [native music/effects](https://support.buffer.com/en-us/articles/adding-music-stickers-and-other-effects-to-instagram-and-tiktok-posts-G5QrWfQL4k), [TikTok photo API](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post), [Buffer API limitations](https://support.buffer.com/articles/using-buffers-api-GtIYIQilz5).

### Local browser worker experiment

If the bridge's format limits block a required adaptation, prototype against a separate browser profile on John's Mac. John signs in himself and handles 2FA; no password or cookie pasted into chat. Use normal visible browser interaction and pause for any login/challenge. First run verifies account identity, loads media and caption, captures the final preview, and stops before publishing. TikTok photo posts remain unsupported until demonstrated end-to-end; video upload success is insufficient.

A local scheduled worker needs the Mac awake and online at execution time. An always-on worker needs another host; a Cloudflare timer alone does not provide the local browser or its session. Sleeping/offline workers should show overdue items for review instead of releasing an accumulated burst on wake.

Before any unattended dispatcher is enabled, implement authenticated worker access, exclusive queue claims, source/revision rechecks, per-account capabilities, and publication receipts. Record each external post/reply ID; if submission might have succeeded, hold for reconciliation rather than retrying blindly. A partially posted X thread must resume from known reply IDs after review, not start again. Select exactly one publishing adapter per queued item to prevent duplicate publication through two routes.

Needed from John at connection time: one-time account authorization (or dedicated-profile login for an experimental browser route), verification of the three destination accounts, and review of the exact first live test. No paid plan or additional model subscription is required merely to evaluate these routes.

## Meta Muse evaluation — 25 October 2026

John already uses Meta Muse. It is a serious candidate for the agent that operates the content workflow: Meta documents a dedicated cloud browser, background work after the app closes, Instagram professional-account analytics, and custom connectors. Its cloud browser could avoid the awake-Mac dependency of a local browser worker, if the required social actions actually work there. This remains a hypothesis until the account-specific preview tests pass.

Primary sources: [Muse introduction](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [business connectors](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [browser controls](https://www.meta.com/en-gb/help/superintelligence/2124746764949121/), [custom connectors](https://www.meta.com/en-gb/help/superintelligence/1687253048996149/).

Do not equate the Instagram analytics connector with media publishing authorization. The inspected Meta material does not establish end-to-end seven-image Instagram/TikTok publishing or connected X threads. Verify the tools visible in John's account and the actual upload/preview behavior. Third-party scheduler connectors can still charge their own subscription/API fees. Muse itself has a free usage allowance that refreshes; it is not unlimited free automation, and Meta says availability/benefits vary by account and region. [Subscription details](https://www.meta.com/help/subscriptions/1021145227643680/).

GitHub evidence supports two different integration directions:

- [agentdash issue 674](https://github.com/thetangstr/agentdash/issues/674) reports an actual Muse-to-remote-MCP OAuth test with PKCE and tool calls. Its client-ID, redirect, and protocol findings are a third-party implementation report, not a stable platform contract; rediscover these during our own integration.
- [fierzone/MUSE_MCP](https://github.com/fierzone/MUSE_MCP) drives the Muse website with Playwright and exposes chat/media through MCP and an OpenAI-compatible interface. This is an unofficial wrapper around Muse; it does not itself provide Instagram/X/TikTok publishing authorization. Not installed or audited here. Prefer Muse's documented custom-connector route for our own studio.

Reddit examples include [a creator reporting a review-then-publish workflow](https://www.reddit.com/r/MetaAI/comments/1xc0146/thank_you_meta_for_muse/) and [users discussing content/analytics workflows](https://www.reddit.com/r/MetaAI/comments/1wcb3cq/what_are_you_using_muse_agent_for_hows_your/). The first includes an invite incentive; treat these as ideas rather than independently verified performance evidence.

Prepared local handoff, outside the public site:

- `/Users/owoblo/Downloads/John Owolabi Muse test.zip`
- `/Users/owoblo/Downloads/John Owolabi Muse test/START HERE - paste into Muse.txt`
- Public source: thought 14, “Maybe I'm Not Behind”; seven original 2160 × 2700 PNGs, exact carousel caption, six-post X thread with weighted lengths and its existing tracked link, file checksum manifest and an explicitly UNTESTED results template.
- ZIP CRC and all seven image hashes/dimensions checked. No private-source thoughts, credentials, social connections or public posts included/created. The handoff stops before publishing or scheduling; verified previews must be distinguished from claimed features.

Recommended sequence: use the package in Muse; verify the destination identity and final Instagram preview; verify the six-post X thread preview; test TikTok PHOTO capability separately. Inspect any delivery conversion without altering the high-resolution masters. Record blockers and any service fees. Only then choose the publishing route and review the exact first live post.

If Muse passes, build a narrow authenticated studio connector for published sources and explicitly selected adaptations. Initial tools should list eligible thoughts, retrieve adaptation snapshots, save draft variations, and report queue/publication status. Exclude admin credentials, email subscribers and private-source thoughts. Add queue/publishing operations only after the existing revision checks, exclusive claims, capability validation and external receipts are implemented. Retain the studio database as the durable record of what was approved and sent; do not rely on chat memory for deduplication or scheduling state.

Muse's connector guidelines distinguish ordinary writes from sensitive writes; sensitive writes require approval each use. Respect that classification and do not promise that every publishing action can run without human review. [Connector permissions](https://platform.muse.ai/docs#3-tool-permissions).

## Instagram and Facebook

- Instagram must be a professional Creator or Business account. For this personal writing brand, Creator is the natural starting choice.
- Facebook publishing targets a Page the owner controls; a personal profile is a different capability and is not covered by the Page publishing API.
- Choose one Meta login integration. Instagram Login can connect a professional Instagram account directly; the Facebook Login route needs a linked Facebook Page and is useful when managing both assets.
- A Meta developer app needs its app ID/secret, approved callback URL, owner/tester access for initial testing, and OAuth authorization for the selected assets. Publishing and insights require separate permissions. Messaging also requires its own permissions and webhooks; it is not automatically included.
- Request only the route-specific permissions actually needed. Meta app review/verification and access levels depend on the app's use and which users it serves.

Sources: [Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Facebook Page posts](https://developers.facebook.com/docs/pages-api/posts/).

## X

An X developer project/app, user-context OAuth with posting/media permissions, callback configuration, and API billing credits are needed. The current API uses pay-per-use credits. Set a spending limit before enabling scheduled publishing or metric polling. User authorization for posting does not automatically provide every analytics or DM capability.

Sources: [X access](https://docs.x.com/x-api/getting-started/getting-access), [X pricing](https://docs.x.com/x-api/getting-started/pricing).

## LinkedIn

Connect the personal member profile first. A developer app and member OAuth with `w_member_social` support member posting. LinkedIn requires a verified LinkedIn Page associated with an app for the Share on LinkedIn product, so an existing administered Page or a dedicated brand Page may also be needed. PDF/document carousels use uploaded document assets. Reading member social data is restricted separately; posting permission does not promise full personal-profile analytics or inbox access. Company Page publishing requires Page roles and organization permissions.

Sources: [Posts API and permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin), [associate an app with a Page](https://www.linkedin.com/help/linkedin/answer/a548360).

## TikTok

An approved integration or publishing partner is the practical starting point for this personal backend. Direct Post needs a developer app, authorized account, posting scope and audit; unaudited clients are limited to private posts. TikTok's guidelines explicitly exclude a private utility for uploading only to accounts managed by its developer/team. Do not promise that our internal studio will receive public Direct Post approval. Keep exports/manual upload available, or connect a suitable approved publishing service. Posting, analytics and messaging access must each be checked independently.

Sources: [TikTok Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [intended use and review guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines).

## First live test

Start with exported carousel review. Then connect accounts, preview the exact destination account/caption/media, and publish one explicitly approved adaptation per platform. Save platform post IDs against the existing thought/adaptation IDs. Confirm the live result and collect only supported metrics. Add scheduling after these checks; failed or ambiguous publication requests must not silently create duplicate posts.
