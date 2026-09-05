import { requireAdmin } from '../_lib/auth.js';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { posts } = await context.request.json();

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
    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      sha = fileData.sha;
    }

    const content = JSON.stringify({ posts }, null, 2);
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
    const deployHookUrl = context.env.CLOUDFLARE_DEPLOY_HOOK_URL;
    let deployTriggered = false;

    if (deployHookUrl) {
      const deployResponse = await fetch(deployHookUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Cloudflare-Pages-Function',
        },
      });

      if (!deployResponse.ok) {
        const deployText = await deployResponse.text();
        throw new Error(`GitHub updated, but deploy trigger failed: ${deployResponse.status} ${deployText}`);
      }

      deployTriggered = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: deployTriggered
          ? 'Post saved to GitHub and deployment triggered successfully!'
          : 'Post saved to GitHub successfully! Deployment hook not configured.',
        commit: result.commit,
        deployTriggered,
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
