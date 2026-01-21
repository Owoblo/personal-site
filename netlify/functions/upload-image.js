// Netlify Function to upload images to GitHub
// Stores images in /images/ folder in the repo

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { filename, content, contentType } = JSON.parse(event.body);

    if (!filename || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing filename or content' })
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
    const branch = 'main';

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = filename.split('.').pop();
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/\.[^.]+$/, '');
    const uniqueFilename = `${safeName}-${timestamp}.${ext}`;
    const filePath = `images/${uniqueFilename}`;

    // Remove base64 prefix if present (e.g., "data:image/png;base64,")
    const base64Content = content.replace(/^data:[^;]+;base64,/, '');

    // Step 1: Check if images folder exists (try to get README or any file)
    // If creating new file, we don't need SHA

    // Step 2: Commit image to GitHub
    const commitMessage = `Add image: ${uniqueFilename}`;

    const uploadResponse = await fetch(
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
          content: base64Content,
          branch: branch
        })
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.message || 'Failed to upload image to GitHub');
    }

    const result = await uploadResponse.json();

    // Return the raw GitHub URL for the image
    // Format: https://raw.githubusercontent.com/owner/repo/branch/path
    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: imageUrl,
        path: filePath,
        message: 'Image uploaded successfully!'
      })
    };

  } catch (error) {
    console.error('Error uploading image to GitHub:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to upload image to GitHub'
      })
    };
  }
};
