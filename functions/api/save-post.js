import { requireAdmin } from '../_lib/auth.js';
import { planPostEmail, queuePostEmail } from '../_lib/post-email.mjs';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { posts, changedPostId, deletedPostId, expectedPost, notifySubscribers } = await context.request.json();

    if (!posts || !Array.isArray(posts) || posts.length > 1000) {
      return new Response(JSON.stringify({ error: 'Invalid posts data' }), {
        status: 400,
        headers,
      });
    }

    const slugs = new Set();
    for (const post of posts) {
      if (!post || !Number.isSafeInteger(post.id) || typeof post.title !== 'string' ||
          typeof post.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) ||
          typeof post.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) ||
          typeof post.excerpt !== 'string' || typeof post.content !== 'string' ||
          !['published', 'draft', 'archived'].includes(post.status || 'published') || slugs.has(post.slug)) {
        return new Response(JSON.stringify({ error: 'Invalid or duplicate post data' }), { status: 400, headers });
      }
      slugs.add(post.slug);
    }

    const githubToken = context.env.GITHUB_TOKEN;
    const githubRepo = context.env.GITHUB_REPO;

    if (!githubToken || !githubRepo) {
      return new Response(
        JSON.stringify({
          error: 'GitHub credentials not configured. Please add GITHUB_TOKEN and GITHUB_REPO environment variables.',
        }),
        { status: 500, headers }
      );
    }

    const [owner, repo] = githubRepo.split('/');
    const filePath = 'posts.json';
    const branch = 'main';

    const getFileResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Cloudflare-Pages-Function',
        },
      }
    );

    let sha;
    let latestPosts = [];
    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      sha = fileData.sha;
      const binary = atob(fileData.content.replace(/\n/g, ''));
      latestPosts = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))).posts;
    } else {
      throw new Error('Could not read the saved posts. Your changes have not been written.');
    }

    let savedPosts = posts;
    let notificationPostId = null;
    const targetId = deletedPostId ?? changedPostId;
    if (targetId !== undefined) {
      if (!Number.isSafeInteger(targetId) || !Array.isArray(latestPosts)) {
        return new Response(JSON.stringify({ error: 'Invalid post update' }), { status: 400, headers });
      }
      const existing = latestPosts.find((post) => post.id === targetId);
      const canonical = (post) => JSON.stringify(post, Object.keys(post).sort());
      if (expectedPost && (!existing || canonical(existing) !== canonical(expectedPost))) {
        return new Response(JSON.stringify({ error: 'This post changed in another session. Your writing is still saved on this device. Reopen the latest version before saving.' }), { status: 409, headers });
      }
      if (deletedPostId !== undefined) {
        savedPosts = latestPosts.filter((post) => post.id !== targetId);
      } else {
        let changed = posts.find((post) => post.id === targetId);
        if (!changed) return new Response(JSON.stringify({ error: 'Post update is missing' }), { status: 400, headers });
        // Reader dates can be backdated. Email notifications track the first actual publication.
        const previousStatus = existing?.status || (existing ? 'published' : null);
        const firstPublishedAt = existing?.firstPublishedAt ||
          (['published', 'archived'].includes(previousStatus) ? `${existing.date}T12:00:00Z` :
            changed.status === 'published' ? new Date().toISOString() : null);
        if (firstPublishedAt) changed = { ...changed, firstPublishedAt };
        // Email state is owned by the publishing workflow, not overwritten by form fields.
        const { _newsletter: _ignored, ...fields } = changed;
        changed = { ...fields, ...(existing?._newsletter ? { _newsletter: existing._newsletter } : {}) };
        const firstPublication = changed.status === 'published' && !['published', 'archived'].includes(previousStatus) && !existing?.firstPublishedAt;
        if (firstPublication && notifySubscribers === true) {
          changed = { ...changed, _newsletter: planPostEmail(changed, latestPosts) };
        }
        if (expectedPost) {
          savedPosts = latestPosts.map((post) => post.id === targetId ? changed : post);
        } else {
          // Independent new drafts can be created on two devices without sharing an ID.
          const id = existing ? Math.max(0, ...latestPosts.map((post) => post.id)) + 1 : targetId;
          const slug = latestPosts.some((post) => post.slug === changed.slug);
          if (slug) return new Response(JSON.stringify({ error: 'That URL slug is already in use. Choose another before saving.' }), { status: 409, headers });
          savedPosts = [...latestPosts, { ...changed, id }];
        }
        if (changed._newsletter?.status === 'pending' && firstPublication) {
          notificationPostId = savedPosts.find((post) => post.slug === changed.slug).id;
        }
      }
      if (new Set(savedPosts.map((post) => post.slug)).size !== savedPosts.length) {
        return new Response(JSON.stringify({ error: 'That URL slug is already in use. Choose another before saving.' }), { status: 409, headers });
      }
    }

    const content = JSON.stringify({ posts: savedPosts }, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const updateResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Pages-Function',
        },
        body: JSON.stringify({
          message: `Update posts.json - ${new Date().toISOString()}`,
          content: encodedContent,
          sha,
          branch,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.message || 'Failed to commit to GitHub');
    }

    const result = await updateResponse.json();
    let notification = null;
    if (notificationPostId !== null) {
      try {
        const queued = await queuePostEmail(context.env, notificationPostId);
        notification = queued.state;
        savedPosts = queued.posts;
      } catch (error) {
        notification = { status: 'failed', error: error.message };
      }
    }
    const deployHookUrl = context.env.CLOUDFLARE_DEPLOY_HOOK_URL;
    let deployTriggered = false;

    if (deployHookUrl) {
      // Live article routes read this saved source directly; a build refresh is optional.
      try {
        const deployResponse = await fetch(deployHookUrl, {
          method: 'POST',
          headers: {
            'User-Agent': 'Cloudflare-Pages-Function',
          },
        });

        deployTriggered = deployResponse.ok;
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: deployTriggered
          ? 'Post saved to GitHub and deployment triggered successfully!'
          : 'Post saved successfully.',
        commit: result.commit,
        deployTriggered,
        posts: savedPosts,
        notification,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to save post to GitHub' }), {
      status: 500,
      headers,
    });
  }
}
