import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.indexOf("--output");
const output = path.resolve(
  arg >= 0
    ? process.argv[arg + 1]
    : path.join(root, "..", "John Owolabi reading library"),
);
if (output === root || output.startsWith(root + path.sep))
  throw Error(
    "Export outside the website repository to keep private drafts out of deploys.",
  );
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const source = await readFile(path.join(root, "posts.json"), "utf8");
const posts = JSON.parse(source).posts.filter(
  (p) =>
    !process.argv.includes("--published-only") ||
    (p.status || "published") === "published",
);
const renderModule = await readFile(path.join(root, "studio-render.mjs"));
const server = createServer((request, response) => {
  if (request.url === "/studio-render.mjs") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(renderModule);
  } else if (request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      '<!doctype html><meta charset="utf-8"><title>Private reading-card export</title>',
    );
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const manifest = {
  createdAt: new Date().toISOString(),
  layout: "reading",
  palette: "mixed",
  export: { format: "PNG", width: 2160, height: 2700, lossless: true },
  sourceDigest: createHash("sha256").update(source).digest("hex"),
  thoughts: [],
};
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (const post of posts) {
    const rendered = await page.evaluate(async (post) => {
      const { renderSlide, zipFiles } = await import("/studio-render.mjs");
      const parsed = new DOMParser().parseFromString(
        String(post.content || ""),
        "text/html",
      );
      parsed.querySelectorAll("script,style").forEach((n) => n.remove());
      let html = parsed.body.innerHTML
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(
          /<\/(?:p|h[1-6]|li|blockquote|div|section|ul|ol|pre)>/gi,
          "\n\n",
        );
      const decoded = new DOMParser().parseFromString(html, "text/html").body
        .textContent;
      const paragraphs = decoded
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
      function split(text, max) {
        const input = words(text),
          result = [];
        let start = 0;
        while (start < input.length) {
          let end = Math.min(start + max, input.length);
          if (end < input.length) {
            for (let j = end; j > start + Math.floor(max * 0.55); j--)
              if (/[.!?…][’”"')\]]*$/.test(input[j - 1])) {
                end = j;
                break;
              }
          }
          result.push(input.slice(start, end).join(" "));
          start = end;
        }
        return result;
      }
      const queue = paragraphs.flatMap((p) => split(p, 90));
      const data = {
        title: post.title,
        text: paragraphs.join("\n\n"),
        caption:
          post.title +
          "\n\n" +
          (post.excerpt || paragraphs[0] || "") +
          "\n\n" +
          ((post.status || "published") === "published"
            ? "Read the full thought: https://johnowolabi.com/post/" +
              post.slug +
              "/"
            : "Private draft for review.") +
          "\n\nMore thoughts and email subscriptions at johnowolabi.com.",
        parts: [],
        template: "reading",
        theme: "mixed",
        photo: "",
        slides: [],
      };
      const canvas = document.createElement("canvas");
      const fontCheck = canvas.getContext("2d");
      fontCheck.font = "42px Georgia,serif";
      if (fontCheck.measureText("John Owolabi").width < 100)
        throw Error("The rendering document has no usable font context.");
      async function fits(slide, last = false) {
        const test = {
          ...data,
          slides: [
            ...data.slides,
            slide,
            ...(last ? [] : [{ heading: "", body: "" }]),
          ],
        };
        return (
          await renderSlide(canvas, test, data.slides.length, { scale: 1 })
        ).fits;
      }
      let group = [];
      while (queue.length) {
        const unit = queue[0],
          candidate = [...group, unit].join("\n\n"),
          slide = {
            heading: data.slides.length === 0 ? post.title : "",
            body: candidate,
          },
          limit = data.slides.length === 0 ? 75 : 105;
        if (words(candidate).length <= limit && (await fits(slide))) {
          group.push(queue.shift());
          continue;
        }
        if (group.length) {
          data.slides.push({
            heading: data.slides.length === 0 ? post.title : "",
            body: group.join("\n\n"),
          });
          group = [];
          continue;
        }
        const count = words(unit).length;
        if (count < 2)
          throw Error("Cannot fit source text under the title: " + post.title);
        queue.splice(0, 1, ...split(unit, Math.ceil(count / 2)));
      }
      if (group.length)
        data.slides.push({
          heading: data.slides.length === 0 ? post.title : "",
          body: group.join("\n\n"),
        });
      if (!data.slides.length) throw Error("No writing in " + post.title);
      const originalWords = words(data.text),
        exportedWords = words(data.slides.map((s) => s.body).join(" "));
      if (JSON.stringify(originalWords) !== JSON.stringify(exportedWords))
        throw Error("Source words changed: " + post.title);
      const cta =
        "Read more at johnowolabi.com.\nSubscribe for future thoughts.";
      const last = data.slides.pop(),
        ending = { ...last, body: last.body + "\n\n" + cta };
      if (words(ending.body).length <= 125 && (await fits(ending, true)))
        data.slides.push(ending);
      else
        data.slides.push(last, {
          heading: "Keep thinking with me.",
          body: cta,
        });
      if (data.slides.length > 30)
        throw Error("Too many slides for the saved editor: " + post.title);
      const files = [],
        images = [];
      for (let i = 0; i < data.slides.length; i++) {
        const result = await renderSlide(canvas, data, i);
        if (!result.fits)
          throw Error("Overflow in " + post.title + " slide " + (i + 1));
        const name = "slide-" + String(i + 1).padStart(2, "0") + ".png";
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
        images.push({
          name,
          base64: canvas.toDataURL("image/png").split(",")[1],
          words: result.words,
        });
      }
      files.push({
        name: "caption.txt",
        bytes: new TextEncoder().encode(data.caption),
      });
      const blob = zipFiles(files),
        zip = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(blob);
        });
      return {
        data,
        images,
        zip,
        sourceWords: originalWords.length,
        sourcePreserved: true,
      };
    }, post);
    const folder =
      String(post.id).padStart(2, "0") +
      "-" +
      String(post.slug || post.title).replace(/[^a-z0-9_-]/gi, "-");
    await mkdir(path.join(output, folder), { recursive: true });
    for (const image of rendered.images)
      await writeFile(
        path.join(output, folder, image.name),
        Buffer.from(image.base64, "base64"),
      );
    await writeFile(
      path.join(output, folder, "slides.zip"),
      Buffer.from(rendered.zip, "base64"),
    );
    await writeFile(
      path.join(output, folder, "caption.txt"),
      rendered.data.caption,
    );
    await writeFile(
      path.join(output, folder, "adaptation.json"),
      JSON.stringify(rendered.data, null, 2),
    );
    const item = {
      postId: post.id,
      thoughtId: post.thoughtId || "thought-" + post.id,
      assetId: (() => {
        const h = createHash("sha256")
          .update(
            "reading-library-v1:" +
              String(post.thoughtId || "thought-" + post.id) +
              ":" +
              JSON.stringify([post.title, post.content]),
          )
          .digest("hex");
        return (
          h.slice(0, 8) +
          "-" +
          h.slice(8, 12) +
          "-5" +
          h.slice(13, 16) +
          "-a" +
          h.slice(17, 20) +
          "-" +
          h.slice(20, 32)
        );
      })(),
      title: post.title,
      status: post.status || "published",
      slug: post.slug,
      date: post.date,
      folder,
      sourceHash: createHash("sha256")
        .update(JSON.stringify([post.title, post.content]))
        .digest("hex"),
      sourceWords: rendered.sourceWords,
      sourcePreserved: true,
      slides: rendered.images.map(({ name, words }) => ({ name, words })),
      data: rendered.data,
    };
    manifest.thoughts.push(item);
    console.log(
      JSON.stringify({
        completed: manifest.thoughts.length,
        total: posts.length,
        title: item.title,
        status: item.status,
        slides: item.slides.length,
        sourcePreserved: true,
      }),
    );
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
if ((await readFile(path.join(root, "posts.json"), "utf8")) !== source)
  throw Error(
    "Writing changed during export. Rerun before saving these drafts.",
  );
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const css = `*{box-sizing:border-box}body{margin:0;background:#f5f3ee;color:#292825;font:16px/1.65 Georgia,serif}main{max-width:1120px;margin:auto;padding:32px 20px}h1{font-size:32px;line-height:1.25}h2{font-size:20px;line-height:1.35}a{color:inherit;text-underline-offset:4px}button,input,select{font:inherit;color:inherit;background:transparent;border:1px solid #77746e;padding:10px 14px}button,a{touch-action:manipulation}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}.muted{color:#77746e}.tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:22px 0}.tools input{flex:1;min-width:0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:26px}.card{border-top:1px solid #e4e0d8;padding-top:18px}.card img{display:block;width:100%;height:auto;margin-bottom:14px}.card h2{margin:0 0 8px}.tag{font-size:13px;color:#77746e}.deck{max-width:560px;margin:24px auto}.deck img{width:100%;height:auto;display:none}.deck img.active{display:block}.deck.all{max-width:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px}.deck.all img{display:block}.deck.all .controls{grid-column:1/-1}.controls{display:flex;align-items:center;justify-content:center;gap:18px;margin:16px 0}.caption{white-space:pre-wrap;max-width:680px}footer{border-top:1px solid #e4e0d8;padding-top:20px;margin-top:36px}[hidden]{display:none!important}@media(prefers-color-scheme:dark){body{background:#1c1b19;color:#e6e2d9}.muted,.tag{color:#aba69b}.card,footer{border-color:#393630}button,input,select{border-color:#77746e}select{background:#1c1b19}}`;
const shell = (title, body, script = "") =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} — John Owolabi</title><style>${css}</style><main>${body}</main>${script ? "<script>" + script + "</script>" : ""}</html>`;
for (const [index, item] of manifest.thoughts.entries()) {
  const edit =
    "https://johnowolabi.com/studio?post=" +
    item.postId +
    "&asset=" +
    item.assetId;
  const navigation = manifest.thoughts[index + 1];
  const body = `<a href="../index.html">← All thoughts</a><p class="tag">${item.status === "draft" ? "PRIVATE SOURCE DRAFT" : "PUBLISHED THOUGHT"} · ${item.slides.length} cards · ${item.sourceWords} original words</p><h1>${esc(item.title)}</h1><div class="tools"><a href="slides.zip" download>Download PNGs + caption</a><a href="${esc(edit)}">Edit in the studio</a><button id="show-all" type="button">Show all cards</button></div><div class="deck" id="deck">${item.slides.map((s, i) => `<img class="${i === 0 ? "active" : ""}" src="${s.name}" alt="Card ${i + 1} of ${item.slides.length}" ${i ? 'loading="lazy"' : ""}>`).join("")}<div class="controls"><button id="previous" type="button" aria-label="Previous card">←</button><span id="position" aria-live="polite">1 / ${item.slides.length}</span><a id="original" href="slide-01.png" target="_blank" rel="noopener">Original PNG</a><button id="next" type="button" aria-label="Next card">→</button></div></div><details><summary>Caption</summary><p class="caption">${esc(item.data.caption)}</p></details><footer><p class="muted">Full writing preserved. Alternating light/dark. Lossless PNG originals at 2160 × 2700. Review draft; nothing has been posted.</p>${navigation ? `<a href="../${navigation.folder}/index.html">Next thought: ${esc(navigation.title)} →</a>` : '<a href="../index.html">Back to the library →</a>'}</footer>`;
  const script = `const images=[...document.querySelectorAll('.deck img')];let current=0;function show(n){current=Math.max(0,Math.min(images.length-1,n));images.forEach((image,i)=>image.classList.toggle('active',i===current));document.getElementById('position').textContent=(current+1)+' / '+images.length;document.getElementById('original').href=images[current].getAttribute('src');document.getElementById('previous').disabled=current===0;document.getElementById('next').disabled=current===images.length-1;}document.getElementById('previous').onclick=()=>show(current-1);document.getElementById('next').onclick=()=>show(current+1);document.getElementById('show-all').onclick=e=>{const all=document.getElementById('deck').classList.toggle('all');e.target.textContent=all?'One card at a time':'Show all cards';};addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='ArrowLeft')show(current-1);if(e.key==='ArrowRight')show(current+1)});let start;document.getElementById('deck').addEventListener('touchstart',e=>{start={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY}},{passive:true});document.getElementById('deck').addEventListener('touchend',e=>{if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*2)show(current+(dx<0?1:-1));start=null},{passive:true});show(0);`;
  await writeFile(
    path.join(output, item.folder, "index.html"),
    shell(item.title, body, script),
  );
}
const published = manifest.thoughts.filter(
    (x) => x.status === "published",
  ).length,
  drafts = manifest.thoughts.filter((x) => x.status === "draft").length;
const body = `<h1>Your thoughts, ready to read.</h1><p class="muted">${manifest.thoughts.length} thoughts · ${published} published · ${drafts} private drafts. All use the approved reading-card layout. Full writing preserved; nothing has been posted.</p><div class="tools"><input id="search" type="search" placeholder="Find a thought" aria-label="Find a thought"><select id="status" aria-label="Source status"><option value="all">All thoughts</option><option value="published">Published</option><option value="draft">Private drafts</option></select><span id="count" role="status">${manifest.thoughts.length} thoughts</span></div><div class="grid">${manifest.thoughts.map((item) => `<article class="card" data-title="${esc(item.title.toLowerCase())}" data-status="${esc(item.status)}"><a href="${item.folder}/index.html"><img src="${item.folder}/slide-01.png" width="1080" height="1350" loading="lazy" alt="Preview of ${esc(item.title)}"><h2>${esc(item.title)}</h2></a><p class="tag">${item.status === "draft" ? "Private draft" : "Published"} · ${item.slides.length} cards</p><a href="${item.folder}/slides.zip" download>Download</a></article>`).join("")}</div><footer><p class="muted">This library is stored locally. Private source drafts remain private in the authenticated studio.</p></footer>`;
const script = `function filter(){const query=document.getElementById('search').value.toLowerCase(),status=document.getElementById('status').value;let count=0;document.querySelectorAll('.card').forEach(card=>{card.hidden=!card.dataset.title.includes(query)||(status!=='all'&&card.dataset.status!==status);if(!card.hidden)count++});document.getElementById('count').textContent=count+' thoughts';}document.getElementById('search').oninput=filter;document.getElementById('status').onchange=filter;`;
await writeFile(
  path.join(output, "index.html"),
  shell("Reading library", body, script),
);
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  JSON.stringify({
    complete: true,
    published,
    drafts,
    totalSlides: manifest.thoughts.reduce((n, p) => n + p.slides.length, 0),
    preview: path.join(output, "index.html"),
  }),
);
