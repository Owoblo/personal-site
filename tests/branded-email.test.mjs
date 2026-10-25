import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrandedEmail } from '../functions/_lib/branded-email.mjs';
const input = { title: 'A thought & a question', excerpt: 'Keep <the original> words.', articleUrl: 'https://johnowolabi.com/post/a-thought/', unsubscribeUrl: 'https://johnowolabi.com/unsubscribe?token=example' };

test('branded email has safe HTML, a text alternative, the site palette, and only owned links', () => {
 const {html,text}=renderBrandedEmail(input);
 assert.match(html,/A thought &amp; a question/);assert.match(html,/Keep &lt;the original&gt; words/);
 assert.match(html,/#F5F3EE/);assert.match(html,/#292825/);assert.match(html,/prefers-color-scheme:dark/);assert.match(html,/Georgia/);
 assert.doesNotMatch(html,/buttondown|resend|amazon|powered by/i);
 assert.ok([...html.matchAll(/href="([^"]+)"/g)].every(m=>new URL(m[1]).origin==='https://johnowolabi.com'));
 assert.match(text,/Unsubscribe: https:\/\/johnowolabi.com\/unsubscribe/);
});

test('template requires an unsubscribe URL and rejects external provider links', () => {
 assert.throws(()=>renderBrandedEmail({...input,unsubscribeUrl:undefined}));
 assert.throws(()=>renderBrandedEmail({...input,unsubscribeUrl:'https://example.com/unsubscribe'}),/must use johnowolabi.com/);
 assert.throws(()=>renderBrandedEmail({...input,articleUrl:'javascript:alert(1)'}),/must use johnowolabi.com/);
});
