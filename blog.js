// Blog post loader
(function () {
    'use strict';

    // Load posts from localStorage or posts.json
    async function loadPosts() {
        try {
            // Always try to load from posts.json first
            // Add cache-busting timestamp to prevent browser caching
            console.log('Attempting to load from posts.json...');
            const timestamp = new Date().getTime();
            const response = await fetch(`posts.json?v=${timestamp}`);
            const data = await response.json();
            const jsonPosts = data.posts || [];
            console.log('Loaded posts from posts.json:', jsonPosts);

            // Then check localStorage
            const stored = localStorage.getItem('blog-posts');
            console.log('Checking localStorage for posts:', stored ? 'Found' : 'Not found');

            if (stored) {
                const localPosts = JSON.parse(stored);
                console.log('Loaded posts from localStorage:', localPosts);

                // Merge posts, preferring localStorage for posts with matching IDs
                const mergedPosts = [...jsonPosts];
                localPosts.forEach(localPost => {
                    const index = mergedPosts.findIndex(p => p.id === localPost.id);
                    if (index >= 0) {
                        // Update existing post with localStorage version
                        mergedPosts[index] = localPost;
                    } else {
                        // Add new post from localStorage
                        mergedPosts.push(localPost);
                    }
                });
                console.log('Merged posts:', mergedPosts);
                return mergedPosts;
            }

            return jsonPosts;
        } catch (error) {
            console.error('Error loading posts:', error);
            // Fallback to localStorage if fetch fails
            const stored = localStorage.getItem('blog-posts');
            if (stored) {
                return JSON.parse(stored);
            }
            return [];
        }
    }

    // Render posts to the page
    function renderPosts(posts, limit = null) {
        const container = document.getElementById('blog-posts');
        console.log('renderPosts called with:', posts);
        console.log('Container element:', container);

        if (!container) {
            console.error('Blog posts container not found!');
            return;
        }

        // Filter to only show published posts (hide drafts and archived)
        const publishedPosts = posts.filter(post => {
            const status = post.status || 'published'; // Default to published for legacy posts
            return status === 'published';
        });

        if (publishedPosts.length === 0) {
            console.log('No published posts to display');
            container.innerHTML = '<li class="loading-state">No posts yet.</li>';
            return;
        }

        // Sort by date, newest first
        let sortedPosts = [...publishedPosts].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Limit posts if specified (for homepage preview)
        if (limit && sortedPosts.length > limit) {
            sortedPosts = sortedPosts.slice(0, limit);
        }

        const html = sortedPosts.map(post => {
            return `
                <li>
                    <a href="post.html?slug=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
                </li>
            `;
        }).join('');

        container.innerHTML = html;
        console.log('Posts rendered successfully! HTML:', html);
    }

    // Render single post page
    function renderSinglePost(posts) {
        const container = document.getElementById('post-content');
        if (!container) return;

        const urlParams = new URLSearchParams(window.location.search);
        const slug = urlParams.get('slug');

        if (!slug) {
            container.innerHTML = '<p>Post not found.</p>';
            return;
        }

        const post = posts.find(p => p.slug === slug);

        if (!post) {
            container.innerHTML = '<p>Post not found.</p>';
            return;
        }

        const date = new Date(post.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Update page title
        document.title = `${post.title} - John Owolabi`;

        // Update meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            // Extract first 150 characters from content as description
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = post.content;
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            const description = textContent.substring(0, 150).trim() + '...';
            metaDescription.setAttribute('content', description);
        }

        // Update Open Graph meta tags
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute('content', `${post.title} - John Owolabi`);

        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = post.content;
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            const description = textContent.substring(0, 150).trim() + '...';
            ogDescription.setAttribute('content', description);
        }

        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.setAttribute('content', `https://johnowolabi.com/post.html?slug=${slug}`);

        // Update Open Graph image with dynamic image
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
            const dynamicImageUrl = `https://johnowolabi.com/.netlify/functions/og-image?title=${encodeURIComponent(post.title)}`;
            ogImage.setAttribute('content', dynamicImageUrl);
        }

        // Update canonical URL
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.setAttribute('href', `https://johnowolabi.com/post.html?slug=${slug}`);

        // Update Twitter Card meta tags
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) twitterTitle.setAttribute('content', `${post.title} - John Owolabi`);

        const twitterDescription = document.querySelector('meta[name="twitter:description"]');
        if (twitterDescription) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = post.content;
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            const description = textContent.substring(0, 150).trim() + '...';
            twitterDescription.setAttribute('content', description);
        }

        // Update Twitter Card image with dynamic image
        const twitterImage = document.querySelector('meta[name="twitter:image"]');
        if (twitterImage) {
            const dynamicImageUrl = `https://johnowolabi.com/.netlify/functions/og-image?title=${encodeURIComponent(post.title)}`;
            twitterImage.setAttribute('content', dynamicImageUrl);
        }

        // Get recent posts (excluding current post, only published)
        const recentPosts = posts
            .filter(p => {
                const status = p.status || 'published';
                return p.slug !== slug && status === 'published';
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 4);

        const recentPostsHtml = recentPosts.length > 0 ? `
            <div class="more-to-read" style="margin-top: 60px; padding-top: 40px; border-top: 1px solid var(--colors--text); opacity: 0.8;">
                <h3 style="font-size: 1.1em; margin-bottom: 20px;">More to Read</h3>
                <ul style="list-style: none; padding: 0;">
                    ${recentPosts.map(p => {
            const pDate = new Date(p.date);
            const pFormattedDate = pDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
            });
            return `<li style="margin-bottom: 12px;">
                            <a href="post.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a>
                            <span style="opacity: 0.6; font-size: 0.9em;"> (${pFormattedDate})</span>
                        </li>`;
        }).join('')}
                </ul>
            </div>
        ` : '';

        // Get current page URL for sharing
        const pageUrl = encodeURIComponent(window.location.href);
        const pageTitle = encodeURIComponent(post.title);

        // Check if post is archived
        const status = post.status || 'published';
        const archivedNotice = status === 'archived' ? `
            <div style="padding: 15px; margin-bottom: 20px; background-color: rgba(108, 117, 125, 0.1); border-left: 3px solid #6c757d;">
                <strong>Note:</strong> This post has been archived and is no longer listed in the main feed.
            </div>
        ` : '';

        // Render post
        container.innerHTML = `
            <article>
                <header>
                    <h1>${escapeHtml(post.title)}</h1>
                    <p class="post-date" style="opacity: 0.7; font-style: italic; margin-top: 10px;">${formattedDate}</p>
                </header>

                ${archivedNotice}

                <div class="post-body" style="margin-top: 30px;">
                    ${post.content}
                </div>

                <!-- Email Subscription -->
                <div class="email-subscription" style="margin-top: 50px; padding: 30px 0; border-top: 1px solid var(--colors--text); border-bottom: 1px solid var(--colors--text);">
                    <p style="margin-bottom: 15px; font-size: 1em;">Get new posts in your inbox</p>
                    <form action="https://buttondown.email/api/emails/embed-subscribe/owolabi" method="post" target="popupwindow" onsubmit="window.open('https://buttondown.email/owolabi', 'popupwindow')" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                        <input type="email" name="email" placeholder="your@email.com" required style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--colors--text); background-color: var(--colors--background); color: var(--colors--text); font-family: inherit; font-size: 0.95em;">
                        <button type="submit" style="padding: 10px 20px; border: 1px solid var(--colors--text); background-color: var(--colors--text); color: var(--colors--background); cursor: pointer; font-family: inherit; font-size: 0.95em; transition: opacity 0.2s ease;">Subscribe</button>
                    </form>
                </div>

                <!-- Share buttons -->
                <div class="share-buttons" style="margin-top: 30px; opacity: 0.6; display: flex; gap: 15px; align-items: center; font-size: 0.9em;">
                    <span>Share:</span>
                    <a href="https://twitter.com/intent/tweet?text=${pageTitle}&url=${pageUrl}" target="_blank" rel="noopener" style="text-decoration: underline;">Twitter</a>
                    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}" target="_blank" rel="noopener" style="text-decoration: underline;">LinkedIn</a>
                    <button onclick="navigator.clipboard.writeText('${window.location.href}'); alert('Link copied!')" style="background: none; border: none; color: var(--colors--text); text-decoration: underline; cursor: pointer; font-family: inherit; font-size: inherit; padding: 0; opacity: inherit;">Copy link</button>
                </div>

                ${recentPostsHtml}
            </article>
        `;
    }

    // Utility function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        console.log('Blog system initializing...');
        const posts = await loadPosts();
        console.log('Posts loaded in init:', posts);

        // Check if we're on the main page, thoughts page, or single post page
        if (document.getElementById('blog-posts')) {
            console.log('Found blog-posts container, rendering posts list...');
            // Check if we're on the homepage (limit to 5 posts) or thoughts page (show all)
            const isHomepage = !document.querySelector('.thoughts-list');
            renderPosts(posts, isHomepage ? 5 : null);
        } else if (document.getElementById('post-content')) {
            console.log('Found post-content container, rendering single post...');
            renderSinglePost(posts);
        } else {
            console.log('No blog container found on this page');
        }
    }
})();
