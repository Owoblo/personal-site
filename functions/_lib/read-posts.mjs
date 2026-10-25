// The index, writer, and live articles all read the same saved source.
export async function readPosts(context) {
    const { GITHUB_TOKEN, GITHUB_REPO, ASSETS } = context.env;
    if (GITHUB_TOKEN && GITHUB_REPO) {
        try {
            const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/posts.json?ref=main`, {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'Cloudflare-Pages-Function',
                },
            });
            if (!response.ok) throw new Error('Could not read saved articles');
            const payload = await response.json();
            const binary = atob(payload.content.replace(/\n/g, ''));
            const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
            if (!Array.isArray(data.posts)) throw new Error('Invalid article data');
            return data;
        } catch (_) {
            // Keep the last deployed articles available during an upstream outage.
        }
    }
    const response = await ASSETS.fetch(new Request(new URL('/posts.json', context.request.url)));
    if (!response.ok) throw new Error('Articles are temporarily unavailable');
    return response.json();
}
