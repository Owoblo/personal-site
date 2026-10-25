const SITE = "https://johnowolabi.com";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Trim to ~155 chars on a word boundary for meta descriptions.
function trimDescription(s, max = 155) {
  const text = String(s ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim() + "...";
}

// Parse YYYY-MM-DD as a local date (avoid UTC-midnight timezone shifts).
function formatDate(iso, opts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(iso);
  return d.toLocaleDateString("en-US", opts);
}

const longDate = (iso) =>
  formatDate(iso, { year: "numeric", month: "long", day: "numeric" });

// Mirrors blog.js formatLegacyPostContent: one-time presentation backfill for
// the article published before the formatter began preserving its HTML.
function formatPostContent(post) {
  if (post.slug !== "understanding-the-complexity-of-consequences")
    return post.content;

  return post.content
    .replace(
      "<p>Because almost nothing important happens because of one thing.</p>",
      "<h2>Nothing Happens for One Reason</h2><p>Because almost nothing important happens because of one thing.</p>"
    )
    .replace(
      "<p>The explosion gets the headline.</p>\n\n<p>The leaking gas line does not.</p>",
      "<blockquote><p>The explosion gets the headline.</p><p>The leaking gas line does not.</p></blockquote>"
    )
    .replace(
      "<p>Your personal life works the same way.</p>",
      "<h2>The Story We See</h2><p>Your personal life works the same way.</p>"
    )
    .replace(
      "<p>Everybody saw the explosion.</p>\n\n<p>Nobody saw the six months that loaded the gun.</p>",
      "<blockquote><p>Everybody saw the explosion.</p><p>Nobody saw the six months that loaded the gun.</p></blockquote>"
    )
    .replace(
      "<p>The same thing happens in relationships.</p>",
      "<h2>The Pattern Repeats</h2><p>The same thing happens in relationships.</p>"
    )
    .replace(
      "<p>The final argument becomes the official story.</p>",
      "<p><strong>The final argument becomes the official story.</strong></p>"
    )
    .replace(
      "<p>Good things rarely happen all at once either.</p>",
      "<h2>The Same Is True of Good Things</h2><p>Good things rarely happen all at once either.</p>"
    )
    .replace(
      "<p>But luck still needs somewhere to land.</p>",
      "<blockquote><p>But luck still needs somewhere to land.</p></blockquote>"
    )
    .replace(
      "<p>That is what I find so fascinating. We are obsessed with events, while life is mostly governed by accumulation.</p>",
      "<h2>Life Is Governed by Accumulation</h2><p>That is what I find so fascinating. We are obsessed with events, while life is mostly governed by accumulation.</p>"
    )
    .replace(
      "<p>This is not one of those pieces where I pretend to have solved life and give you seven habits to transform yourself before Monday.</p>",
      "<h2>What This Is Not</h2><p>This is not one of those pieces where I pretend to have solved life and give you seven habits to transform yourself before Monday.</p>"
    );
}

export function renderPostPage(post, allPosts, { ogImageUrl } = {}) {
  const canonical = `${SITE}/post/${post.slug}/`;
  const title = `${post.title} | John Owolabi`;
  const description = trimDescription(post.excerpt || post.title);
  const ogImage = ogImageUrl || `${SITE}/og/${post.slug}.png?v=20260921-2`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    datePublished: post.date,
    author: { "@type": "Person", name: "John Owolabi" },
    url: canonical,
    mainEntityOfPage: canonical,
  }).replace(/<\//g, "<\\/");

  const recentPosts = allPosts
    .filter((p) => p.slug !== post.slug)
    .slice(0, 4)
    .map((p) => {
      const pDate = formatDate(p.date, { year: "numeric", month: "short" });
      return `<li style="margin-bottom: 12px;">
                            <a href="/post/${encodeURIComponent(p.slug)}/">${escapeHtml(p.title)}</a>
                            <span class="post-meta"> (${escapeHtml(pDate)})</span>
                        </li>`;
    })
    .join("");

  const pageUrl = encodeURIComponent(canonical);
  const pageTitle = encodeURIComponent(post.title);

  // Body markup mirrors renderSinglePost() in blog.js so the static page
  // looks exactly like the client-rendered one.
  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">

    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:type" content="article">
    <meta property="article:published_time" content="${escapeHtml(post.date)}">
    <meta property="article:author" content="John Owolabi">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">

    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="/styles.css?v=20261025-5">

    <link rel="alternate" type="application/rss+xml" title="John Owolabi — Thoughts" href="https://johnowolabi.com/feed.xml">
    <link rel="canonical" href="${escapeHtml(canonical)}">

    <script type="application/ld+json">${jsonLd}</script>
</head>

<body>
    <div class="container">
        <header class="site-header post-header">
            <div class="back-button-wrapper">
                <a href="/" class="site-title">John Owolabi</a>
            </div>
            <!-- Dark/Light Mode Toggle -->
            <div class="theme-toggle-wrapper">
                <label class="toggle-switch" for="theme-toggle" aria-label="Toggle dark mode">
                    <input type="checkbox" id="theme-toggle" class="toggle-checkbox">
                    <span class="toggle-label has-transition"></span>
                </label>
            </div>
        </header>

        <div id="post-content">
            <article>
                <header>
                    <h1>${escapeHtml(post.title)}</h1>
                    <p class="post-date" style="font-style: italic; margin-top: 10px;">${escapeHtml(longDate(post.date))}</p>
                </header>

                <div class="post-body" style="margin-top: 30px;">
                    ${formatPostContent(post)}
                </div>

                <!-- Email Subscription -->
                <div class="email-subscription" style="margin-top: 50px; padding: 30px 0; border-top: 1px solid var(--colors--divider); border-bottom: 1px solid var(--colors--divider);">
                    <p style="margin-bottom: 15px; font-size: 1em;">Get new posts in your inbox</p>
                    <form action="https://buttondown.com/api/emails/embed-subscribe/johnowolabi" method="post" class="newsletter-form-group">
                        <input type="hidden" name="embed" value="1">
                        <input type="email" name="email" placeholder="Your email address" required aria-label="Email address">
                        <button type="submit">Subscribe</button>
                    </form>
                    <p class="subscription-note">Confirm in your inbox. Unsubscribe whenever you like.</p>
                </div>

                <!-- Share buttons -->
                <div class="share-buttons" style="margin-top: 30px; opacity: 0.6; display: flex; gap: 15px; align-items: center; font-size: 0.9em;">
                    <span>Share:</span>
                    <a href="https://twitter.com/intent/tweet?text=${pageTitle}&url=${pageUrl}" target="_blank" rel="noopener" style="text-decoration: underline;">Twitter</a>
                    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}" target="_blank" rel="noopener" style="text-decoration: underline;">LinkedIn</a>
                    <button onclick="navigator.clipboard.writeText('${escapeHtml(canonical)}'); alert('Link copied!')" style="background: none; border: none; color: var(--colors--text); text-decoration: underline; cursor: pointer; font-family: inherit; font-size: inherit; padding: 0; opacity: inherit;">Copy link</button>
                </div>

                <div class="more-to-read" style="margin-top: 60px; padding-top: 40px; border-top: 1px solid var(--colors--text); opacity: 0.8;">
                    <h3 style="font-size: 1.1em; margin-bottom: 20px;">More to Read</h3>
                    <ul style="list-style: none; padding: 0;">
                        ${recentPosts}
                    </ul>
                </div>
            </article>
        </div>

    </div>

    <!-- Blog Posts Loader -->
    <script src="/blog.js?v=20261025-1"></script>

    <!-- Table of contents sidebar (article pages, wide screens) -->
    <script src="/toc.js?v=20260920-2"></script>

    <!-- Analytics Tracker -->
    <script src="/analytics.js"></script>

    <script>
        // Swipe gesture navigation
        (function () {
            let touchStartX = 0;
            let touchStartY = 0;
            let touchEndX = 0;
            let touchEndY = 0;
            const minSwipeDistance = 100;

            document.addEventListener('touchstart', function (e) {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
            }, { passive: true });

            document.addEventListener('touchend', function (e) {
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                handleSwipe();
            }, { passive: true });

            function handleSwipe() {
                const swipeDistanceX = touchEndX - touchStartX;
                const swipeDistanceY = Math.abs(touchEndY - touchStartY);

                // Only trigger if horizontal swipe is dominant (not vertical scroll)
                // Swipe left (going backwards/home)
                if (swipeDistanceX < -minSwipeDistance && swipeDistanceX < -swipeDistanceY * 2) {
                    window.location.href = '/';
                }
            }
        })();

        // Dark/Light mode toggle functionality
        (function () {
            const toggleCheckbox = document.getElementById('theme-toggle');
            const body = document.body;

            // Check for saved user preference, otherwise check system preference
            const currentTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

            // Set initial theme
            if (currentTheme === 'dark' || (!currentTheme && prefersDark)) {
                body.classList.add('u-mode-invert');
                toggleCheckbox.checked = true;
            }

            // Toggle theme on checkbox change
            toggleCheckbox.addEventListener('change', function () {
                if (this.checked) {
                    body.classList.add('u-mode-invert');
                    localStorage.setItem('theme', 'dark');
                } else {
                    body.classList.remove('u-mode-invert');
                    localStorage.setItem('theme', 'light');
                }
            });

            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                if (!localStorage.getItem('theme')) {
                    if (e.matches) {
                        body.classList.add('u-mode-invert');
                        toggleCheckbox.checked = true;
                    } else {
                        body.classList.remove('u-mode-invert');
                        toggleCheckbox.checked = false;
                    }
                }
            });
        })();
    </script>
</body>

</html>
`;
}


export { escapeHtml, trimDescription, formatDate, longDate };
