import { readFile, writeFile } from 'node:fs/promises';
import { renderBrandedEmail } from '../functions/_lib/branded-email.mjs';
const { posts } = JSON.parse(await readFile(new URL('../posts.json', import.meta.url), 'utf8'));
const post = posts.find(p => p.slug === 'the-explosion-gets-the-headline' && p.status === 'published') || posts.find(p => p.status === 'published');
const { html } = renderBrandedEmail({ title: post.title, excerpt: post.excerpt, articleUrl: `https://johnowolabi.com/post/${post.slug}/`, unsubscribeUrl: 'https://johnowolabi.com/#unsubscribe-preview' });
const preview = html.replace(/<body([^>]*)>/, '<body$1><p style="margin:0;padding:12px 20px;font:13px Georgia,serif;text-align:center;">Design preview · No email is sent. Subscription links are inactive in this preview.</p>')
    .replace(/(<a\b[^>]*href=")https:\/\/johnowolabi\.com\/#(?:subscribe|unsubscribe-preview)("[^>]*>)/g, '$1#$2');
const destination = process.argv[2] || '/private/tmp/john-owolabi-email-preview.html';
await writeFile(destination, preview);
console.log(`Email design preview: ${destination}`);
