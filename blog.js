// Blog post loader
(function() {
    'use strict';

    // Load posts from localStorage or posts.json
    async function loadPosts() {
        try {
            // First try localStorage
            const stored = localStorage.getItem('blog-posts');
            console.log('Checking localStorage for posts:', stored ? 'Found' : 'Not found');

            if (stored) {
                const posts = JSON.parse(stored);
                console.log('Loaded posts from localStorage:', posts);
                return posts;
            }

            // Fallback to posts.json
            console.log('Attempting to load from posts.json...');
            const response = await fetch('posts.json');
            const data = await response.json();
            console.log('Loaded posts from posts.json:', data.posts);
            return data.posts || [];
        } catch (error) {
            console.error('Error loading posts:', error);
            // Return empty array on error
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

        if (posts.length === 0) {
            console.log('No posts to display');
            container.innerHTML = '<li style="opacity: 0.7;">No posts yet.</li>';
            return;
        }

        // Sort by date, newest first
        let sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Limit posts if specified (for homepage preview)
        if (limit && sortedPosts.length > limit) {
            sortedPosts = sortedPosts.slice(0, limit);
        }

        const html = sortedPosts.map(post => {
            const date = new Date(post.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
            });

            return `
                <li>
                    <a href="post.html?slug=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
                    (${formattedDate})
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

        // Get recent posts (excluding current post)
        const recentPosts = posts
            .filter(p => p.slug !== slug)
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

        // Render post
        container.innerHTML = `
            <article>
                <header>
                    <h1>${escapeHtml(post.title)}</h1>
                    <p class="post-date" style="opacity: 0.7; font-style: italic; margin-top: 10px;">${formattedDate}</p>
                </header>
                <div class="post-body" style="margin-top: 30px;">
                    ${post.content}
                </div>

                <!-- Email Subscription -->
                <div class="email-subscription" style="margin-top: 50px; padding: 30px 0; border-top: 1px solid var(--colors--text); border-bottom: 1px solid var(--colors--text);">
                    <p style="margin-bottom: 15px; font-size: 1em;">Get new posts in your inbox</p>
                    <form action="https://buttondown.email/api/emails/embed-subscribe/johnowolabi" method="post" target="popupwindow" onsubmit="window.open('https://buttondown.email/johnowolabi', 'popupwindow')" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                        <input type="email" name="email" placeholder="your@email.com" required style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--colors--text); background-color: var(--colors--background); color: var(--colors--text); font-family: inherit; font-size: 0.95em;">
                        <button type="submit" style="padding: 10px 20px; border: 1px solid var(--colors--text); background-color: var(--colors--text); color: var(--colors--background); cursor: pointer; font-family: inherit; font-size: 0.95em; transition: opacity 0.2s ease;">Subscribe</button>
                    </form>
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
