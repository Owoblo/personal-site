export async function checkOutbox(env) {
    if (!env.NEWSLETTER_CRON_SECRET) throw new Error('Newsletter retry job is not configured.');
    const response = await fetch(env.NEWSLETTER_ENDPOINT, {
        method: 'POST', headers: { Authorization: `Bearer ${env.NEWSLETTER_CRON_SECRET}` },
    });
    if (!response.ok) throw new Error(`Newsletter retry check failed (HTTP ${response.status}).`);
    const result = await response.json();
    console.log(JSON.stringify({ event: 'newsletter-outbox-check', ...result }));
    return result;
}

export default {
    async scheduled(_event, env, context) { context.waitUntil(checkOutbox(env)); },
};
