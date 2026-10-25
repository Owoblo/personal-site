import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPostPage } from '../functions/_lib/render-post.mjs';
import { onRequestGet as article } from '../functions/post/[[path]].js';
import { onRequestGet as feed } from '../functions/posts.json.js';
import { onRequestPost as save } from '../functions/api/save-post.js';
import { createSessionCookie } from '../functions/_lib/auth.js';

const secret = 'test-session-secret';
const base = { id: 1, title: 'A thought & an observation', slug: 'a-thought', date: '2026-10-25', excerpt: 'A short introduction.', content: '<h2>A clear idea</h2><p>Keep <strong>this emphasis</strong>.</p>', status: 'published' };
const draft = { ...base, id: 2, slug: 'private-thought', status: 'draft' };
const archived = { ...base, id: 3, slug: 'older-thought', status: 'archived' };
const source = [base, draft, archived];
const encoded = (posts) => Buffer.from(JSON.stringify({ posts })).toString('base64');

async function context(path = '/posts.json', { posts = source, authenticated = false, remote = false, staticStatus = 404, body, method = 'GET' } = {}) {
  const cookie = authenticated ? (await createSessionCookie(secret)).split(';')[0] : '';
  return {
    request: new Request(`https://example.test${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
    env: {
      ADMIN_PASSWORD: secret,
      ...(remote ? { GITHUB_TOKEN: 'test-only-token', GITHUB_REPO: 'example/site' } : {}),
      ASSETS: { async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/posts.json') return Response.json({ posts });
        if (url.pathname === '/404.html') return new Response('<h1>Page not found</h1>', { status: 200 });
        return new Response('Static article', { status: staticStatus });
      } },
    },
  };
}

test('static and live article template preserves semantic content and escapes title metadata', () => {
  const html = renderPostPage(base, [base]);
  assert.ok(html.includes(base.content));
  assert.match(html, /A thought &amp; an observation/);
  assert.match(html, /class="post-body"/);
  assert.match(html, /styles.css\?v=20261025-5/);
});

test('newly saved published articles are live without a static file or rebuild', async () => {
  const response = await article(await context('/post/a-thought/'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(base.content));
  assert.match(html, /https:\/\/johnowolabi.com\/11.png/);
});

test('draft URLs stay unavailable even if an old published asset exists', async () => {
  const response = await article(await context('/post/private-thought/', { staticStatus: 200 }));
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /this emphasis/);
});

test('archived articles remain accessible directly and unknown URLs remain missing', async () => {
  assert.equal((await article(await context('/post/older-thought/'))).status, 200);
  assert.equal((await article(await context('/post/does-not-exist/'))).status, 404);
  assert.equal((await article(await context('/post/deleted-post/', { staticStatus: 200 }))).status, 404);
});

test('public feed contains published posts; authenticated writer can reopen drafts', async () => {
  const publicPosts = await (await feed(await context())).json();
  assert.deepEqual(publicPosts.posts.map((post) => post.id), [1]);
  const writerPosts = await (await feed(await context('/posts.json', { authenticated: true }))).json();
  assert.deepEqual(writerPosts.posts.map((post) => post.id), [1, 2, 3]);
});

test('public feed excludes internal email metadata while retaining it for the writer', async () => {
  const posts = [{ ...base, _newsletter: { requestId: 'private-outbox-reference', status: 'queued' } }];
  const publicFeed = await (await feed(await context('/posts.json', { posts }))).json();
  assert.equal(publicFeed.posts[0]._newsletter, undefined);
  const ownerFeed = await (await feed(await context('/posts.json', { posts, authenticated: true }))).json();
  assert.equal(ownerFeed.posts[0]._newsletter.requestId, 'private-outbox-reference');
});

test('article route uses the latest saved source, preserving Unicode and formatting', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ content: encoded([{ ...base, content: '<p>A new thought — <em>éclat</em>.</p>' }]) }));
  const response = await article(await context('/post/a-thought/', { remote: true, staticStatus: 200 }));
  assert.match(await response.text(), /A new thought — <em>éclat<\/em>/);
});

test('upstream outage retains deployed reading content', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const response = await article(await context('/post/a-thought/', { remote: true }));
  assert.ok((await response.text()).includes(base.content));
});

function mockGitHub(t, initial) {
  let persisted = structuredClone(initial);
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options = {}) => {
    if (options.method === 'PUT') {
      writes++;
      persisted = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8')).posts;
      return Response.json({ commit: { sha: 'test-commit' } });
    }
    return Response.json({ sha: 'test-source-sha', content: encoded(persisted) });
  });
  return { get posts() { return persisted; }, get writes() { return writes; } };
}

async function saveRequest(body, authenticated = true) {
  return context('/api/save-post', { remote: true, authenticated, method: 'POST', body });
}

test('first publication can announce once, while draft saves and published edits stay silent', async (t) => {
  let posts = [structuredClone(draft)];
  let announcements = 0;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).startsWith('https://api.buttondown.com/')) {
      announcements++;
      return Response.json({ id: 'owner-test-provider-reference' });
    }
    if (options.method === 'PUT') {
      posts = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8')).posts;
      return Response.json({ commit: { sha: 'test-commit' } });
    }
    return Response.json({ sha: 'test-source-sha', content: encoded(posts) });
  });
  async function update(changed) {
    const ctx = await saveRequest({ posts: [changed], changedPostId: 2, expectedPost: structuredClone(posts[0]), notifySubscribers: true });
    ctx.env.BUTTONDOWN_API_KEY = 'test-only-key';
    const response = await save(ctx);
    assert.equal(response.status, 200);
    return response.json();
  }
  await update({ ...draft, content: '<p>Still private.</p>' });
  assert.equal(announcements, 0);
  const result = await update({ ...posts[0], status: 'published' });
  assert.equal(result.notification.status, 'queued');
  assert.equal(announcements, 1);
  assert.ok(posts[0].firstPublishedAt);
  await update({ ...posts[0], title: 'A revised title' });
  assert.equal(announcements, 1);
});

test('saving a private draft survives a new authenticated session, then publishes only when requested', async (t) => {
  const store = mockGitHub(t, [base]);
  const response = await save(await saveRequest({ posts: [base, draft], changedPostId: 2, expectedPost: null }));
  assert.equal(response.status, 200);
  assert.equal(store.posts[1].status, 'draft');
  const fresh = await (await feed(await context('/posts.json', { remote: true, authenticated: true }))).json();
  assert.equal(fresh.posts.find((post) => post.id === 2).status, 'draft');
  assert.equal((await article(await context('/post/private-thought/', { remote: true }))).status, 404);
  const edited = { ...draft, content: '<p>A revised <strong>thought</strong>.</p>' };
  assert.equal((await save(await saveRequest({ posts: [base, edited], changedPostId: 2, expectedPost: draft }))).status, 200);
  assert.equal(store.posts[1].content, edited.content);
  const published = { ...edited, status: 'published' };
  assert.equal((await save(await saveRequest({ posts: [base, published], changedPostId: 2, expectedPost: edited }))).status, 200);
  const live = await article(await context('/post/private-thought/', { remote: true }));
  assert.equal(live.status, 200);
  assert.ok((await live.text()).includes(published.content));
});

test('saving one draft preserves posts saved from another device', async (t) => {
  const extra = { ...base, id: 7, slug: 'another-device', status: 'draft' };
  const store = mockGitHub(t, [base, draft, extra]);
  const edited = { ...draft, content: '<p>An edit.</p>' };
  const response = await save(await saveRequest({ posts: [base, edited], changedPostId: 2, expectedPost: draft }));
  assert.equal(response.status, 200);
  assert.ok(store.posts.some((post) => post.id === 7));
});

test('stale edits receive a conflict and do not overwrite a newer draft', async (t) => {
  const newer = { ...draft, content: '<p>The newer version.</p>' };
  const store = mockGitHub(t, [base, newer]);
  const response = await save(await saveRequest({ posts: [base, draft], changedPostId: 2, expectedPost: draft }));
  assert.equal(response.status, 409);
  assert.equal(store.writes, 0);
  assert.equal(store.posts[1].content, newer.content);
});

test('two new drafts from separate devices do not collide on their local ID', async (t) => {
  const store = mockGitHub(t, [base, draft]);
  const another = { ...draft, slug: 'a-different-thought' };
  const response = await save(await saveRequest({ posts: [base, another], changedPostId: 2, expectedPost: null }));
  assert.equal(response.status, 200);
  assert.equal(store.posts.length, 3);
  assert.notEqual(store.posts[1].id, store.posts[2].id);
});

test('saving remains protected by the existing admin session', async (t) => {
  const store = mockGitHub(t, [base]);
  const response = await save(await saveRequest({ posts: [base, draft], changedPostId: 2, expectedPost: null }, false));
  assert.equal(response.status, 401);
  assert.equal(store.writes, 0);
});
