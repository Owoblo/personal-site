export async function onRequestGet(context) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
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
    const binaryContent = atob(payload.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binaryContent, (char) => char.charCodeAt(0));
    const content = new TextDecoder('utf-8').decode(bytes);

    return new Response(content, { status: 200, headers });
  } catch (error) {
    return context.env.ASSETS.fetch(context.request);
  }
}
