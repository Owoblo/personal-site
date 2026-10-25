import { AwsClient } from 'aws4fetch';

export function sesReady(env) {
    return Boolean(env.NEWSLETTER_DB && env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY && env.NEWSLETTER_UNSUBSCRIBE_SECRET);
}

export async function sesRequest(env, path, { method = 'GET', body } = {}) {
    const region = env.AWS_SES_REGION || 'us-east-2';
    // SendEmail is not idempotent. Retrying a network timeout requires reconciliation.
    const client = new AwsClient({ accessKeyId: env.AWS_SES_ACCESS_KEY_ID, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY, region, service: 'ses', retries: 0 });
    try {
        const response = await client.fetch(`https://email.${region}.amazonaws.com/v2/email/${path}`, {
            method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(`Email service returned HTTP ${response.status}.`);
            error.status = response.status;
            error.code = data.code || data.Code || data.__type;
            error.uncertain = response.status >= 500;
            throw error;
        }
        return data;
    } catch (error) {
        if (!error.status) error.uncertain = true;
        throw error;
    }
}

export async function sendEmail(env, { to, subject, html, text, unsubscribeUrl, tags = [] }) {
    const data = await sesRequest(env, 'outbound-emails', { method: 'POST', body: {
        FromEmailAddress: 'John Owolabi <hello@johnowolabi.com>', ReplyToAddresses: ['hello@johnowolabi.com'],
        Destination: { ToAddresses: [to] }, ConfigurationSetName: 'johnowolabi-thoughts',
        EmailTags: [{ Name: 'site', Value: 'johnowolabi' }, ...tags],
        Content: { Simple: {
            Subject: { Data: subject.replace(/[\r\n]/g, ' '), Charset: 'UTF-8' },
            Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
            ...(unsubscribeUrl ? { Headers: [
                { Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` },
                { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
                { Name: 'List-Id', Value: 'John Owolabi thoughts <thoughts.johnowolabi.com>' },
            ] } : {}),
        } },
    } });
    if (!data.MessageId) { const error = new Error('The email service did not return a message reference.'); error.uncertain = true; throw error; }
    return data.MessageId;
}

export async function suppressionReason(env, email) {
    try {
        const data = await sesRequest(env, `suppression/addresses/${encodeURIComponent(email)}`);
        return data.SuppressedDestination?.Reason || null;
    } catch (error) { if (error.status === 404) return null; throw error; }
}
