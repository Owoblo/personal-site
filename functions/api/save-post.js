export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { posts } = await context.request.json();

    if (!posts || !Array.isArray(posts)) {
      return new Response(JSON.stringify({ error: 'Invalid posts data' }), {
        status: 400,
        headers,
      });
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

    return new Response(
      JSON.stringify({ success: true, message: 'Post saved to GitHub successfully!', commit: result.commit }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to save post to GitHub' }), {
      status: 500,
      headers,
    });
  }
}
