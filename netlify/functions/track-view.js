// Netlify Function to track page views
// Stores analytics data in analytics.json via GitHub

exports.handler = async (event, context) => {
  // Allow GET requests for tracking
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { page, referrer, userAgent } = JSON.parse(event.body);

    if (!page) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Page URL required' })
      };
    }

    // Get GitHub credentials
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;

    if (!githubToken || !githubRepo) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GitHub credentials not configured' })
      };
    }

    const [owner, repo] = githubRepo.split('/');
    const filePath = 'analytics.json';
    const branch = 'main';

    // Step 1: Get current analytics file
    let analyticsData = { views: [] };
    let sha;

    try {
      const getFileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Netlify-Function'
          }
        }
      );

      if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        sha = fileData.sha;
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        analyticsData = JSON.parse(content);
      }
    } catch (error) {
      // File doesn't exist yet, will create it
      console.log('Analytics file does not exist, creating new one');
    }

    // Step 2: Add new view
    const view = {
      page,
      timestamp: new Date().toISOString(),
      referrer: referrer || 'direct',
      userAgent: userAgent || 'unknown'
    };

    analyticsData.views.push(view);

    // Keep only last 10,000 views to prevent file from getting too large
    if (analyticsData.views.length > 10000) {
      analyticsData.views = analyticsData.views.slice(-10000);
    }

    // Step 3: Commit to GitHub
    const content = JSON.stringify(analyticsData, null, 2);
    const encodedContent = Buffer.from(content).toString('base64');

    const updateResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Netlify-Function'
        },
        body: JSON.stringify({
          message: `Track view: ${page}`,
          content: encodedContent,
          sha: sha,
          branch: branch
        })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.message || 'Failed to commit to GitHub');
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error tracking view:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
