import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const SITE = "https://johnowolabi.com";

// Static copies. sitemap.xml and thoughts.html are generated below,
// so they are intentionally NOT in this list.
const topLevelFiles = [
  "11.png",
  "404.html",
  "_routes.json",
  "analytics.html",
  "analytics.js",
  "analytics.json",
  "blog.js",
  "carousel.html",
  "create.html",
  "debug.html",
  "favicon.svg",
  "index.html",
  "llms-full.txt",
  "llms.txt",
  "p.jpeg",
  "post.html",
  "posts.json",
  "robots.txt",
  "styles.css",
  "toc.js",
];

const topLevelDirectories = ["fonts", "images", "posts"];

// ---------------------------------------------------------------- helpers

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

// ---------------------------------------------------------------- data

const postsData = JSON.parse(
  await readFile(path.join(rootDir, "posts.json"), "utf8")
);
const published = (postsData.posts || [])
  .filter((p) => (p.status || "published") === "published" && p.slug)
  .sort((a, b) => new Date(b.date) - new Date(a.date));

// ---------------------------------------------------------------- OG images
// X/Twitter and other crawlers cannot render SVG link previews, so each
// post gets a real 1200x630 PNG generated at build time. The design mirrors
// functions/api/og-image.js (kept for dynamic use).

function ogWrapText(text, maxLength) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxLength) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function ogEscapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ogSvg(title) {
  const width = 1200;
  const height = 630;
  const padX = 100;
  const fontFamily = "Lora, Georgia, serif";

  // Name, Dario-style: big and bold at the top
  const name = "John Owolabi";
  const nameFontSize = 88;

  // Title below the name, regular serif
  const titleFontSize = 68;
  const titleLineHeight = titleFontSize * 1.25;
  const lines = ogWrapText(title, 26).slice(0, 3);

  const nameY = 200;
  const titleStartY = nameY + 90;

  const titleTextElements = lines
    .map((line, index) => {
      const y = titleStartY + index * titleLineHeight;
      return `<text x="${padX}" y="${y}" style="font-family: ${fontFamily}; font-size: ${titleFontSize}px; fill: #1a1a1a;">${ogEscapeXml(line)}</text>`;
    })
    .join("\n");

  // Bottom pill caption, Dario-style
  const pillLabel = `${name} \u2014 ${title}`;
  const pillFontSize = 30;
  const pillPadX = 36;
  const pillPadY = 20;
  const pillText = pillLabel.length > 52 ? pillLabel.slice(0, 49) + "\u2026" : pillLabel;
  const pillWidth = pillText.length * (pillFontSize * 0.58) + pillPadX * 2;
  const pillHeight = pillFontSize + pillPadY * 2;
  const pillX = padX;
  const pillY = height - 60 - pillHeight;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#F0EEE6"/>
  <text x="${padX}" y="${nameY}" style="font-family: ${fontFamily}; font-size: ${nameFontSize}px; font-weight: bold; fill: #1a1a1a;">${ogEscapeXml(name)}</text>
  ${titleTextElements}
  <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${pillHeight / 2}" fill="#1c1c1c"/>
  <text x="${pillX + pillPadX}" y="${pillY + pillPadY + pillFontSize * 0.78}" style="font-family: ${fontFamily}; font-size: ${pillFontSize}px; fill: #ffffff;">${ogEscapeXml(pillText)}</text>
</svg>`;
}

async function writeOgPng(post) {
  const resvg = new Resvg(ogSvg(post.title), {
    fitTo: { mode: "width", value: 1200 },
    font: {
      fontFiles: [path.join(rootDir, "assets", "fonts", "Lora-Variable.ttf")],
      loadSystemFonts: false,
      defaultFontFamily: "Lora",
    },
  });
  const png = resvg.render().asPng();
  const dir = path.join(distDir, "og");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${post.slug}.png`), png);
}

// ---------------------------------------------------------------- post pages

function renderPostPage(post, allPosts) {
  const canonical = `${SITE}/post/${post.slug}/`;
  const title = `${post.title} | John Owolabi`;
  const description = trimDescription(post.excerpt || post.title);
  const ogImage = `${SITE}/og/${post.slug}.png`;

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
                            <span style="opacity: 0.6; font-size: 0.9em;"> (${escapeHtml(pDate)})</span>
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="/styles.css?v=20260920-2">

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
                    <p class="post-date" style="opacity: 0.7; font-style: italic; margin-top: 10px;">${escapeHtml(longDate(post.date))}</p>
                </header>

                <div class="post-body" style="margin-top: 30px;">
                    ${formatPostContent(post)}
                </div>

                <!-- Email Subscription -->
                <div class="email-subscription" style="margin-top: 50px; padding: 30px 0; border-top: 1px solid var(--colors--text); border-bottom: 1px solid var(--colors--text);">
                    <p style="margin-bottom: 15px; font-size: 1em;">Get new posts in your inbox</p>
                    <form action="https://buttondown.email/api/emails/embed-subscribe/johnowolabi" method="post" target="popupwindow" onsubmit="window.open('https://buttondown.email/johnowolabi', 'popupwindow')" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                        <input type="email" name="email" placeholder="your@email.com" required style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--colors--text); background-color: var(--colors--background); color: var(--colors--text); font-family: inherit; font-size: 0.95em;">
                        <button type="submit" style="padding: 10px 20px; border: 1px solid var(--colors--text); background-color: var(--colors--text); color: var(--colors--background); cursor: pointer; font-family: inherit; font-size: 0.95em; transition: opacity 0.2s ease;">Subscribe</button>
                    </form>
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
    <script src="/blog.js?v=2"></script>

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

// ---------------------------------------------------------------- thoughts

function renderThoughtsList(posts) {
  return posts
    .map((p) => {
      const url = `/post/${encodeURIComponent(p.slug)}/`;
      const desc = trimDescription(p.excerpt || "", 160);
      return `                <li>
                    <a href="${url}">${escapeHtml(p.title)}</a>
                    <span style="opacity: 0.6; font-size: 0.9em;"> (${escapeHtml(longDate(p.date))})</span>
                    <p style="opacity: 0.75; margin: 6px 0 18px;">${escapeHtml(desc)}</p>
                </li>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------- sitemap

function renderSitemap(posts) {
  const urls = [
    `  <url><loc>${SITE}/</loc></url>`,
    `  <url><loc>${SITE}/thoughts</loc></url>`,
    ...posts.map(
      (p) =>
        `  <url><loc>${SITE}/post/${p.slug}/</loc><lastmod>${escapeHtml(p.date)}</lastmod></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// ---------------------------------------------------------------- build

async function pathExists(targetPath) {
  try {
    await readdir(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyEntry(entry) {
  const source = path.join(rootDir, entry);
  const destination = path.join(distDir, entry);
  await cp(source, destination, { recursive: true });
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const file of topLevelFiles) {
  await copyEntry(file);
}

for (const directory of topLevelDirectories) {
  if (await pathExists(path.join(rootDir, directory))) {
    await copyEntry(directory);
  }
}

// Prerendered post pages
let postCount = 0;
for (const post of published) {
  const dir = path.join(distDir, "post", post.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "index.html"),
    renderPostPage(post, published),
    "utf8"
  );
  await writeOgPng(post);
  postCount++;
}
console.log(`Generated ${postCount} static post pages`);
console.log(`Generated ${postCount} OG preview PNGs`);

// Prerendered thoughts page
const thoughtsSrc = await readFile(
  path.join(rootDir, "thoughts.html"),
  "utf8"
);
const placeholder = '<li class="loading-state">Loading posts...</li>';
if (!thoughtsSrc.includes(placeholder)) {
  throw new Error("thoughts.html placeholder not found; cannot prerender list");
}
await writeFile(
  path.join(distDir, "thoughts.html"),
  thoughtsSrc.replace(placeholder, renderThoughtsList(published)),
  "utf8"
);
console.log("Prerendered thoughts.html");

// Fresh sitemap (replaces the stale repo-root sitemap.xml)
await writeFile(
  path.join(distDir, "sitemap.xml"),
  renderSitemap(published),
  "utf8"
);
console.log("Generated sitemap.xml");
