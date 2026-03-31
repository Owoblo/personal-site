export async function onRequestGet(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  const githubToken = context.env.GITHUB_TOKEN;
  const githubRepo = context.env.GITHUB_REPO;

  if (!githubToken || !githubRepo) {
    return context.env.ASSETS.fetch(context.request);
  }

  try {
    const [owner, repo] = githubRepo.split('/');
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/posts.json?ref=main`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Cloudflare-Pages-Function',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`);
    }

    const payload = await response.json();
    const content = atob(payload.content.replace(/\n/g, ''));

    return new Response(content, { status: 200, headers });
  } catch (error) {
    return context.env.ASSETS.fetch(context.request);
  }
}
