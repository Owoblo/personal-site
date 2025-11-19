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
    function renderPosts(posts) {
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
        const sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));

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

        // Check if we're on the main page or single post page
        if (document.getElementById('blog-posts')) {
            console.log('Found blog-posts container, rendering posts list...');
            renderPosts(posts);
        } else if (document.getElementById('post-content')) {
            console.log('Found post-content container, rendering single post...');
            renderSinglePost(posts);
        } else {
            console.log('No blog container found on this page');
        }
    }
})();
