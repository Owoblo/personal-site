import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFeed } from '../functions/feed.xml.js';
import { planPostEmail, queuePostEmail } from '../functions/_lib/post-email.mjs';
import { onRequestPost as retry } from '../functions/api/newsletter.js';

const post = { id: 40, title: 'A thought & a question', slug: 'a-thought', date: '2026-01-01', excerpt: 'A short introduction.', content: '<p>Keep <strong>the words</strong>.</p><p><img src="/images/example.jpg" alt="An image"></p>', status: 'published' };

test('RSS exposes published content only, with stable identities and absolute image URLs', () => {
 const rss=renderFeed([post,{...post,id:41,slug:'private-draft',status:'draft'},{...post,id:42,slug:'archived-essay',status:'archived'}]);
 assert.match(rss,/A thought &amp; a question/);assert.match(rss,/urn:johnowolabi:post:40/);
 assert.match(rss,/https:\/\/johnowolabi.com\/images\/example.jpg/);
 assert.doesNotMatch(rss,/private-draft|archived-essay/);
 assert.match(rss,/<strong>the words<\/strong>/);
 assert.match(rss,/Thu, 01 Jan 2026 12:00:00 GMT/);
});

test('publication time is distinct from backdated reader dates and survives later edits', () => {
 const first='2026-10-25T15:00:00.000Z';
 const rss=renderFeed([{...post,firstPublishedAt:first,updatedAt:'2026-10-26T15:00:00Z'}]);
 assert.match(rss,/Sun, 25 Oct 2026 15:00:00 GMT/);
 assert.equal(renderFeed([post]).match(/<guid[^>]*>([^<]*)/)[1],renderFeed([{...post,slug:'renamed-post'}]).match(/<guid[^>]*>([^<]*)/)[1]);
});

test('notification includes a short introduction and canonical article link', () => {
 const state=planPostEmail(post,[],new Date('2026-10-25T15:00:00Z'));
 assert.equal(state.status,'pending');assert.equal(state.subject,post.title);
 assert.match(state.body,/A thought &amp; a question/);assert.match(state.body,/https:\/\/johnowolabi.com\/post\/a-thought\//);
 assert.doesNotMatch(state.body,/Keep <strong>the words/);
 assert.equal(state.scheduledFor,undefined);
});

test('multiple announcements are spaced a day apart rather than sent as a burst', () => {
 const previous={...post,id:39,_newsletter:{mode:'send',requestedAt:'2026-10-25T15:00:00.000Z'}};
 const next=planPostEmail(post,[previous],new Date('2026-10-25T15:01:00Z'));
 assert.equal(next.scheduledFor,'2026-10-26T15:00:00.000Z');
});

function store(t,{failOnce=false}={}) {
 let posts=[{...post,_newsletter:planPostEmail(post,[],new Date())}];let sends=0;let first=true;const keys=[];
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  if(String(url).startsWith('https://api.buttondown.com/')){
   sends++;keys.push(options.headers['X-Idempotency-Key']);
   const payload=JSON.parse(options.body);assert.equal(payload.should_trigger_pay_per_email_billing,false);assert.equal(payload.archival_mode,'disabled');
   if(failOnce&&first){first=false;return new Response('',{status:503})}
   return Response.json({id:'em_test_notification',status:payload.status});
  }
  if(options.method==='PUT'){posts=JSON.parse(Buffer.from(JSON.parse(options.body).content,'base64').toString('utf8')).posts;return Response.json({commit:{sha:'test'}})}
  return Response.json({sha:'test',content:Buffer.from(JSON.stringify({posts})).toString('base64')});
 });
 return {env:{GITHUB_TOKEN:'test',GITHUB_REPO:'test/site',BUTTONDOWN_API_KEY:'test'},get posts(){return posts},get sends(){return sends},keys};
}

test('queueing records provider reference and repeated queue requests do not create another email', async(t)=>{
 const data=store(t);const first=await queuePostEmail(data.env,40);assert.equal(first.state.status,'queued');assert.equal(first.state.emailId,'em_test_notification');
 await queuePostEmail(data.env,40);assert.equal(data.sends,1);
});

test('failed notification remains retryable with the original idempotency key', async(t)=>{
 const data=store(t,{failOnce:true});const first=await queuePostEmail(data.env,40);assert.equal(first.state.status,'failed');
 const second=await queuePostEmail(data.env,40);assert.equal(second.state.status,'queued');assert.equal(data.keys[0],data.keys[1]);
});

test('anonymous visitors cannot retry owner email notifications',async()=>{
 const response=await retry({request:new Request('https://example.test/api/newsletter',{method:'POST',body:JSON.stringify({action:'retry',postId:40})}),env:{ADMIN_PASSWORD:'test'}});
 assert.equal(response.status,401);
});

test('cron endpoint is protected by its dedicated secret',async()=>{
 const {onRequestPost}=await import('../functions/api/newsletter-cron.js');
 const response=await onRequestPost({request:new Request('https://example.test/api/newsletter-cron',{method:'POST'}),env:{NEWSLETTER_CRON_SECRET:'a'.repeat(64)}});
 assert.equal(response.status,401);
});

test('cron dry run excludes drafts, completed emails, and exhausted or backed-off attempts',async()=>{
 const {onRequestPost}=await import('../functions/api/newsletter-cron.js');
 const state=planPostEmail(post,[]);
 const posts=[{...post,_newsletter:state},{...post,id:41,status:'draft',_newsletter:state},{...post,id:42,_newsletter:{...state,status:'queued'}},{...post,id:43,_newsletter:{...state,status:'failed',attempts:8}},{...post,id:44,_newsletter:{...state,status:'failed',nextAttemptAt:'2099-01-01T00:00:00Z'}}];
 const response=await onRequestPost({request:new Request('https://example.test/api/newsletter-cron?dry_run=1',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)}}),env:{NEWSLETTER_CRON_SECRET:'a'.repeat(64),ASSETS:{fetch:async()=>Response.json({posts})}}});
 assert.deepEqual(await response.json(),{pending:1,queued:0,scheduled:0,failed:0});
});

test('scheduled worker calls only the protected site outbox endpoint',async(t)=>{
 const {checkOutbox}=await import('../workers/newsletter-cron/worker.mjs');
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://example.test/api/newsletter-cron');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer test-only-cron-secret');return Response.json({pending:0,queued:0,scheduled:0,failed:0})});
 assert.equal((await checkOutbox({NEWSLETTER_ENDPOINT:'https://example.test/api/newsletter-cron',NEWSLETTER_CRON_SECRET:'test-only-cron-secret'})).pending,0);
});
