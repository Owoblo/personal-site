import { requireAdmin } from '../_lib/auth.js';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { filename, content, contentType } = await context.request.json();

    if (!filename || !content) {
      return new Response(JSON.stringify({ error: 'Missing filename or content' }), { status: 400, headers });
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(contentType) || content.length > 14_000_000) {
      return new Response(JSON.stringify({ error: 'Use a JPG, PNG, WebP, or GIF image under 10 MB' }), { status: 400, headers });
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
    const branch = 'main';

    const timestamp = Date.now();
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = extensions[contentType];
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/\.[^.]+$/, '');
    const uniqueFilename = `${safeName}-${timestamp}.${ext}`;
    const filePath = `images/${uniqueFilename}`;

    const base64Content = content.replace(/^data:[^;]+;base64,/, '');

    const uploadResponse = await fetch(
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
          message: `Add image: ${uniqueFilename}`,
          content: base64Content,
          branch,
        }),
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.message || 'Failed to upload image to GitHub');
    }

    const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

    return new Response(
      JSON.stringify({ success: true, url: imageUrl, path: filePath, message: 'Image uploaded successfully!' }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to upload image to GitHub' }), {
      status: 500,
      headers,
    });
  }
}
