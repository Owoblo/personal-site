import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

const topLevelFiles = [
  "11.png",
  "404.html",
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
  "sitemap.xml",
  "styles.css",
  "thoughts.html",
];

const topLevelDirectories = [
  "fonts",
  "images",
  "posts",
];

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
