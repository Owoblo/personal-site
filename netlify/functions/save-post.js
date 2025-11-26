// Netlify Function to save post to GitHub
// This commits posts.json to your repo so it's available on all devices

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { posts } = JSON.parse(event.body);

    if (!posts || !Array.isArray(posts)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid posts data' })
      };
    }

    // Get GitHub credentials from environment variables
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO; // Format: "username/repo"

    if (!githubToken || !githubRepo) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'GitHub credentials not configured. Please add GITHUB_TOKEN and GITHUB_REPO environment variables.'
        })
      };
    }

    const [owner, repo] = githubRepo.split('/');
    const filePath = 'posts.json';
    const branch = 'main';

    // Step 1: Get current file SHA (required for updating)
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

    let sha;
    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      sha = fileData.sha;
    }

    // Step 2: Prepare new content
    const content = JSON.stringify({ posts }, null, 2);
    const encodedContent = Buffer.from(content).toString('base64');

    // Step 3: Commit to GitHub
    const commitMessage = `Update posts.json - ${new Date().toISOString()}`;

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
          message: commitMessage,
          content: encodedContent,
          sha: sha, // Required for updates
          branch: branch
        })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.message || 'Failed to commit to GitHub');
    }

    const result = await updateResponse.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Post saved to GitHub successfully!',
        commit: result.commit
      })
    };

  } catch (error) {
    console.error('Error saving post to GitHub:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to save post to GitHub'
      })
    };
  }
};
