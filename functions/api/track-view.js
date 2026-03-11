export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const { page, referrer, userAgent } = await context.request.json();

    if (!page) {
      return new Response(JSON.stringify({ error: 'Page URL required' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const githubToken = context.env.GITHUB_TOKEN;
    const githubRepo = context.env.GITHUB_REPO;

    if (!githubToken || !githubRepo) {
      return new Response(JSON.stringify({ error: 'GitHub credentials not configured' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const [owner, repo] = githubRepo.split('/');
    const filePath = 'analytics.json';
    const branch = 'main';

    let analyticsData = { views: [] };
    let sha;

    try {
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

      if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        sha = fileData.sha;
        const content = atob(fileData.content.replace(/\n/g, ''));
        analyticsData = JSON.parse(content);
      }
    } catch {
      // File doesn't exist yet, will create it
    }

    analyticsData.views.push({
      page,
      timestamp: new Date().toISOString(),
      referrer: referrer || 'direct',
      userAgent: userAgent || 'unknown',
    });

    if (analyticsData.views.length > 10000) {
      analyticsData.views = analyticsData.views.slice(-10000);
    }

    const content = JSON.stringify(analyticsData, null, 2);
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
          message: `Track view: ${page}`,
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
