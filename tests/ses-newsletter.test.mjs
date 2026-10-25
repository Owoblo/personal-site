import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './helpers/d1.mjs';
import { onRequestPost as subscribe } from '../functions/api/subscribe.js';
import { onRequestGet as confirm } from '../functions/api/confirm-subscription.js';
import { onRequestGet as unsubscribeGet, onRequestPost as unsubscribePost } from '../functions/api/unsubscribe.js';
import { unsubscribeUrl } from '../functions/_lib/newsletter-store.mjs';
import { createSesCampaign, processSesOutbox } from '../functions/_lib/ses-outbox.mjs';
import { onRequestPost as save } from '../functions/api/save-post.js';
import { createSessionCookie } from '../functions/_lib/auth.js';

function setup(t, { uncertain = false, legacyActive = [] } = {}) {
 const db=testDatabase();t.after(()=>db.close());
 const env={NEWSLETTER_DB:db,NEWSLETTER_SENDING_ENABLED:'true',NEWSLETTER_PROVIDER:'ses',AWS_SES_ACCESS_KEY_ID:'test-id',AWS_SES_SECRET_ACCESS_KEY:'test-secret',NEWSLETTER_UNSUBSCRIBE_SECRET:'test-preferences-secret-'.repeat(3),BUTTONDOWN_API_KEY:'test-legacy'};
 const messages=[];
 t.mock.method(globalThis,'fetch',async(input,options)=>{
  const request=input instanceof Request?input:new Request(input,options),url=new URL(request.url);
  if(url.hostname==='api.buttondown.com')return Response.json({results:legacyActive.map(id=>({id})),next:null});
  assert.equal(url.hostname,'email.us-east-2.amazonaws.com');
  if(url.pathname.includes('/suppression/addresses/'))return Response.json({}, {status:404});
  assert.match(request.headers.get('Authorization'),/^AWS4-HMAC-SHA256/);
  const body=await request.json();messages.push(body);
  if(uncertain)throw new TypeError('Network acknowledgement lost');
  return Response.json({MessageId:'message-'+messages.length});
 });
 return {env,db,messages};
}
const request=email=>new Request('https://johnowolabi.com/api/subscribe',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://johnowolabi.com','CF-Connecting-IP':'192.0.2.1'},body:new URLSearchParams({email}).toString()});
async function contact(db,email,status='confirmed',legacy=null){const id=crypto.randomUUID();await db.prepare('INSERT INTO newsletter_contacts(id,email,status,source,legacy_id,created_at,confirmed_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,email,status,'test',legacy,'2026-01-01T00:00:00.000Z',status==='confirmed'?'2026-01-01T00:00:00.000Z':null,'2026-01-01T00:00:00.000Z').run();return id}
const post={id:40,slug:'a-real-thought',title:'A real thought',excerpt:'The idea, in my words.',status:'published',_newsletter:{requestId:'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+ 'a'.repeat(12),subject:'A real thought'}};

test('own signup stays pending until confirmation, and owned unsubscribe works without a login',async(t)=>{
 const {env,db,messages}=setup(t);
 const response=await subscribe({request:request('reader@example.com'),env});assert.equal(response.status,303);assert.equal(messages.length,1);
 assert.equal((await db.prepare('SELECT status FROM newsletter_contacts').first()).status,'pending');
 const body=messages[0].Content.Simple.Body.Html.Data;assert.doesNotMatch(body,/buttondown|powered by/i);
 assert.equal(messages[0].FromEmailAddress,'John Owolabi <hello@johnowolabi.com>');
 const confirmUrl=body.match(/href="(https:\/\/johnowolabi.com\/api\/confirm-subscription\?token=[^"]+)/)[1];
 assert.equal((await confirm({request:new Request(confirmUrl),env})).status,303);
 const saved=await db.prepare('SELECT * FROM newsletter_contacts').first();assert.equal(saved.status,'confirmed');assert.equal(saved.confirmation_hash,null);
 const link=await unsubscribeUrl(env,saved.id);
 assert.equal((await unsubscribeGet({request:new Request(link),env})).status,200);
 assert.equal((await db.prepare('SELECT status FROM newsletter_contacts').first()).status,'confirmed');
 assert.equal((await unsubscribePost({request:new Request(link,{method:'POST',body:'List-Unsubscribe=One-Click'}),env})).status,200);
 assert.equal((await db.prepare('SELECT status FROM newsletter_contacts').first()).status,'unsubscribed');
 const forged = new URL(link);const signed=forged.searchParams.get('token');forged.searchParams.set('token',(signed[0]==='f'?'0':'f')+signed.slice(1));
 assert.equal((await unsubscribePost({request:new Request(forged,{method:'POST'}),env})).status,400);
});

test('repeated requests are throttled without sending more confirmation emails',async(t)=>{
 const {env,messages}=setup(t);
 for(let i=0;i<7;i++){const response=await subscribe({request:request('reader@example.com'),env});assert.equal(response.status,i===6?429:303)}
 assert.equal(messages.length,1);
});

test('publication snapshots confirmed readers only, submits in batches, and never repeats completed recipients',async(t)=>{
 const {env,db,messages}=setup(t);
 for(const email of ['a@example.com','b@example.com','c@example.com'])await contact(db,email);
 await contact(db,'pending@example.com','pending');await contact(db,'left@example.com','unsubscribed');
 await createSesCampaign(env,post);await createSesCampaign(env,post);
 assert.equal((await processSesOutbox(env,[post],{limit:2})).submitted,2);
 assert.equal((await processSesOutbox(env,[post],{limit:2})).submitted,1);
 await processSesOutbox(env,[post]);assert.equal(messages.length,3);
 for(const message of messages){assert.equal(message.Destination.ToAddresses.length,1);assert.equal(message.Content.Simple.Headers.find(h=>h.Name==='List-Unsubscribe-Post').Value,'List-Unsubscribe=One-Click');assert.doesNotMatch(message.Content.Simple.Body.Html.Data,/buttondown|powered by/i)}
 assert.equal((await db.prepare('SELECT status FROM newsletter_campaigns').first()).status,'complete');
});

test('an uncertain send is held for review and is not retried automatically',async(t)=>{
 const {env,db,messages}=setup(t,{uncertain:true});await contact(db,'reader@example.com');await createSesCampaign(env,post);
 assert.equal((await processSesOutbox(env,[post])).uncertain,1);await processSesOutbox(env,[post]);assert.equal(messages.length,1);
 assert.equal((await db.prepare('SELECT status FROM newsletter_deliveries').first()).status,'uncertain');
});

test('a legacy unsubscribe and an unpublished article are both respected before sending',async(t)=>{
 const {env,db,messages}=setup(t);await contact(db,'reader@example.com','confirmed','legacy-reader');await createSesCampaign(env,post);
 await processSesOutbox(env,[post]);assert.equal(messages.length,0);assert.equal((await db.prepare('SELECT status FROM newsletter_contacts').first()).status,'unsubscribed');
 const another={...post,id:41,_newsletter:{...post._newsletter,requestId:crypto.randomUUID()}};await createSesCampaign(env,another);
 await processSesOutbox(env,[]);assert.equal((await db.prepare('SELECT status FROM newsletter_campaigns WHERE post_id=41').first()).status,'cancelled');
});

test('publishing through the writer creates one SES campaign; later edits create none',async(t)=>{
 const {env,db,messages}=setup(t);env.ADMIN_PASSWORD='test-admin';env.GITHUB_TOKEN='test-token';env.GITHUB_REPO='test/site';
 const { _newsletter, ...fields }=post;let posts=[{...fields,status:'draft',date:'2026-10-25',content:'<p>My words.</p>'}];
 const providerFetch=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  if(!String(url).startsWith('https://api.github.com/'))return providerFetch(url,options);
  if(options.method==='PUT'){posts=JSON.parse(Buffer.from(JSON.parse(options.body).content,'base64').toString('utf8')).posts;return Response.json({commit:{sha:'test'}})}
  return Response.json({sha:'test',content:Buffer.from(JSON.stringify({posts})).toString('base64')});
 });
 const cookie=(await createSessionCookie(env.ADMIN_PASSWORD)).split(';')[0];
 async function update(change){const response=await save({env,request:new Request('https://johnowolabi.com/api/save-post',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({posts:[{...posts[0],...change}],changedPostId:40,expectedPost:posts[0],notifySubscribers:true})})});assert.equal(response.status,200);return response.json()}
 assert.equal((await update({status:'published'})).notification.provider,'ses');
 await update({title:'A clearer title'});
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM newsletter_campaigns').first()).count,1);
 assert.equal(posts[0].status,'published');assert.equal(messages.length,0);
});

test('inline signup keeps confirmation private, saves archive choice, and provides recoverable JSON errors',async(t)=>{
 const {env,db,messages}=setup(t);
 const make=(email,archive='1')=>new Request('https://johnowolabi.com/api/subscribe',{method:'POST',headers:{Accept:'application/json',Origin:'https://johnowolabi.com','CF-Connecting-IP':'192.0.2.55'},body:new URLSearchParams({email,archive})});
 const response=await subscribe({request:make('inline@example.com'),env});
 assert.equal(response.status,200);const accepted=await response.json();assert.equal(accepted.success,true);assert.equal(accepted.status,'pending');assert.equal(messages.length,1);
 const c=await db.prepare('SELECT * FROM newsletter_contacts').first();assert.equal(c.status,'pending');assert.equal((await db.prepare('SELECT archive_enabled FROM newsletter_preferences WHERE contact_id=?').bind(c.id).first()).archive_enabled,1);
 const invalid=await subscribe({request:make('invalid'),env});assert.equal(invalid.status,400);assert.equal((await invalid.json()).success,false);
 const url=messages[0].Content.Simple.Body.Html.Data.match(/href="(https:\/\/johnowolabi.com\/api\/confirm-subscription\?token=[^"]+)/)[1];const confirmed=await confirm({request:new Request(url),env});assert.match(confirmed.headers.get('Set-Cookie'),/john_newsletter=confirmed/);
 const repeat=await subscribe({request:make('inline@example.com'),env});assert.deepEqual(await repeat.json(),accepted);assert.equal(messages.length,1);
 const link=await unsubscribeUrl(env,c.id),left=await unsubscribePost({request:new Request(link,{method:'POST'}),env});assert.match(left.headers.get('Set-Cookie'),/Max-Age=0/);
});
