# Connecting John's social accounts

No accounts are connected or posting automatically. The site currently links to Instagram `johnowolabi_` and X `johnowolabi_`; confirm these and supply the Facebook Page, LinkedIn profile, and TikTok profile URLs. Use account authorization rather than sending passwords. Store provider credentials only as encrypted backend secrets, never in source, browser storage, public assets, or Git.

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
