const SITE = 'https://johnowolabi.com';
const escape = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function ownLink(value) {
    const url = new URL(value);
    if (url.origin !== SITE) throw new Error('Newsletter links must use johnowolabi.com.');
    return url.href;
}

// Transport-independent template. The sending service must provide a working,
// signed unsubscribe URL on our domain before this can be sent to subscribers.
export function renderBrandedEmail({ title, excerpt, articleUrl, unsubscribeUrl, confirmation = false }) {
    const article = ownLink(articleUrl);
    const unsubscribe = confirmation ? null : ownLink(unsubscribeUrl);
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(title)}</title>
<style>
@media (prefers-color-scheme:dark){body,.canvas{background-color:#1C1B19!important;color:#E6E2D9!important}.ink,a{color:#E6E2D9!important}.muted{color:#ABA69B!important}.rule{border-color:#393630!important}}
@media screen and (max-width:660px){.content{width:100%!important}.padding{padding:36px 20px!important}.name{font-size:30px!important}}
</style></head>
<body style="margin:0;padding:0;background-color:#F5F3EE;color:#292825;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="canvas" style="background-color:#F5F3EE;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" class="content" style="width:100%;max-width:640px;"><tr><td class="padding" style="padding:48px 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.65;">
<p class="name ink" style="margin:0 0 8px;color:#292825;font-size:32px;line-height:1.2;font-weight:bold;">John Owolabi</p>
<p class="muted" style="margin:0 0 32px;color:#77746E;font-size:14px;">Building things. Studying people. Questioning assumptions.</p>
<div class="rule" style="border-top:1px solid #E4E0D8;margin-bottom:32px;"></div>
<p class="muted" style="margin:0 0 12px;color:#77746E;font-size:14px;">${confirmation ? 'One more step' : 'A new thought'}</p>
<h1 class="ink" style="margin:0 0 20px;color:#292825;font-size:24px;line-height:1.35;">${escape(title)}</h1>
<p style="margin:0 0 24px;">${escape(excerpt)}</p>
<p style="margin:0 0 32px;"><a class="ink" href="${escape(article)}" style="color:#292825;text-decoration:underline;text-underline-offset:3px;">${confirmation ? 'Confirm my subscription' : 'Read the thought →'}</a></p>
<p style="margin:0 0 36px;">— John</p>
<div class="rule" style="border-top:1px solid #E4E0D8;margin-bottom:20px;"></div>
<p class="muted" style="margin:0 0 8px;color:#77746E;font-size:13px;">${confirmation ? 'If you didn’t request this, you can ignore this email. You won’t be added to the list.' : 'You’re receiving this because you subscribed to my thoughts.'}</p>
<p class="muted" style="margin:0;color:#77746E;font-size:13px;"><a class="muted" href="${SITE}/#subscribe" style="color:#77746E;text-decoration:underline;">${confirmation ? 'johnowolabi.com' : 'Subscribe'}</a>${confirmation ? '' : ` · <a class="muted" href="${escape(unsubscribe)}" style="color:#77746E;text-decoration:underline;">Unsubscribe</a>`}</p>
</td></tr></table></td></tr></table></body></html>`;
    return { html, text: `John Owolabi\nBuilding things. Studying people. Questioning assumptions.\n\n${title}\n\n${excerpt}\n\n${confirmation ? 'Confirm my subscription' : 'Read the thought'}: ${article}\n\n— John\n\n${confirmation ? 'If you didn’t request this, ignore this email. You won’t be added to the list.' : `You’re receiving this because you subscribed to my thoughts.\nSubscribe: ${SITE}/#subscribe\nUnsubscribe: ${unsubscribe}`}` };
}

export function renderConfirmationEmail(confirmUrl) {
    return renderBrandedEmail({ title: 'Confirm your subscription', excerpt: 'Thanks for wanting to stay in touch. Confirm your email below, and I’ll send you a short note when I publish a new thought.', articleUrl: confirmUrl, confirmation: true });
}
