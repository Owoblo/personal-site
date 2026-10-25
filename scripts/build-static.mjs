import { renderPostPage, escapeHtml, trimDescription, formatDate, longDate } from "../functions/_lib/render-post.mjs";
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
  "_redirects",
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
  "writer.css",
  "writer-theme.js",
  "article-formatting.js",
  "subscribe.html",
  "studio.html",
  "studio.js",
  "studio-organizer.js",
  "studio.css",
  "studio-render.mjs",
  "reader-metrics.js",
  "jo-email.png",
  "jo-avatar.png",
  "subscription.js",
];

const topLevelDirectories = ["fonts", "images", "posts", "brand"];

// ---------------------------------------------------------------- helpers

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
  const width=1200,height=630;
  let size=64,lines=ogWrapText(title,31);
  while(lines.length>3&&size>48){size-=4;lines=ogWrapText(title,Math.round(31*64/size));}
  const titleLines=lines.map((line,index)=>`<text x="88" y="${244+index*size*1.25}" font-family="Lora, Georgia, serif" font-size="${size}" fill="#292825">${ogEscapeXml(line)}</text>`).join('');
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#F5F3EE"/><text x="88" y="91" font-family="Lora, Georgia, serif" font-size="30" fill="#77746E">JO</text><text x="162" y="92" font-family="Lora, Georgia, serif" font-size="46" font-weight="bold" fill="#292825">John Owolabi</text><path d="M88 137H1112" stroke="#E4E0D8"/>${titleLines}<path d="M88 538H1112" stroke="#E4E0D8"/><text x="88" y="582" font-family="Lora, Georgia, serif" font-size="25" fill="#77746E">Building things. Studying people. Questioning assumptions.</text><text x="1112" y="582" text-anchor="end" font-family="Lora, Georgia, serif" font-size="25" fill="#77746E">johnowolabi.com</text></svg>`;
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

// ---------------------------------------------------------------- thoughts

function renderThoughtsList(posts) {
  return posts
    .map((p) => {
      const url = `/post/${encodeURIComponent(p.slug)}/`;
      const desc = trimDescription(p.excerpt || "", 160);
      return `                <li>
                    <a href="${url}">${escapeHtml(p.title)}</a>
                    <span class="post-meta"> (${escapeHtml(longDate(p.date))})</span>
                    <p class="post-excerpt">${escapeHtml(desc)}</p>
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

// Ship pinned local parser assets with the editor; no third-party CDN is needed.
await mkdir(path.join(distDir, 'vendor'), { recursive: true });
for (const [source, name] of [
  ['node_modules/markdown-it/dist/browser/markdown-it.umd.min.js', 'markdown-it.min.js'],
  ['node_modules/turndown/dist/turndown.js', 'turndown.js'],
]) {
  await cp(path.join(rootDir, source), path.join(distDir, 'vendor', name));
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
