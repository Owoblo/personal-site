import { renderSlide, splitBody, zipFiles } from "./studio-render.mjs";
const $ = (id) => document.getElementById(id),
  escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = { posts: [], assets: [], voice: {}, inspiration: [] },
  asset = null,
  slide = 0,
  dirty = false,
  renderVersion = 0,
  timer;
function status(text, error = false) {
  $("studio-status").textContent = text;
  $("studio-status").className = error ? "auth-error" : "status";
}
async function api(url, body) {
  const r = await fetch(url, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(data.error || "The workspace is temporarily unavailable.");
  return data;
}
function bind(id, fn) {
  $(id).addEventListener("click", async (e) => {
    e.preventDefault();
    const button = e.currentTarget;
    button.disabled = true;
    try {
      await fn(e);
    } catch (error) {
      status(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}
function currentPost() {
  return state.posts.find((p) => p.id === Number($("thought-select").value));
}
function persistRecovery() {
  if (!asset) return;
  try {
    localStorage.setItem(
      "john-studio-" + asset.id,
      JSON.stringify({
        revision: asset.revision,
        data: readData(),
        savedAt: Date.now(),
      }),
    );
  } catch {}
}
function announceSaved() {
  if (!asset) return;
  dirty = true;
  asset.state = "draft";
  $("asset-state").textContent = "Draft · unsaved changes";
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(
        "john-studio-" + asset.id,
        JSON.stringify({
          revision: asset.revision,
          data: readData(),
          savedAt: Date.now(),
        }),
      );
      $("asset-save-state").textContent =
        "Recovery copy saved on this device. Save draft to reopen on another device.";
    } catch {
      $("asset-save-state").textContent =
        "Local recovery is full. Save draft to keep these edits.";
    }
  }, 600);
}
function readData() {
  if (!asset) return null;
  return {
    ...asset.data,
    title: $("asset-title").value,
    text: $("asset-text").value,
    parts: $("asset-parts")
      .value.split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    caption: $("asset-caption").value,
    template: $("carousel-template").value,
    theme: $("carousel-theme").value,
  };
}
function renderSaved() {
  const p = currentPost();
  $("thought-identity").textContent = p ? `${p.status} · ${p.thoughtId}` : "";
  $("saved-adaptations").replaceChildren();
  for (const a of state.assets.filter((a) => a.thought_id === p?.thoughtId)) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = `${a.format} · ${a.data.title || "Untitled"} · ${a.state}`;
    b.addEventListener("click", () => {
      if (
        dirty &&
        !confirm(
          "Switch adaptations? Your current edits have a local recovery copy.",
        )
      )
        return;
      openAsset(a);
    });
    $("saved-adaptations").append(b);
  }
}
async function openAsset(a) {
  if (a.lazy) {
    try {
      status("Opening the saved adaptation…");
      a = (await api("/api/studio?asset=" + encodeURIComponent(a.id))).asset;
    } catch (error) {
      status(error.message, true);
      return;
    }
  }
  if (dirty) persistRecovery();
  clearTimeout(timer);
  asset = structuredClone(a);
  slide = 0;
  dirty = false;
  let recovery;
  try {
    recovery = JSON.parse(localStorage.getItem("john-studio-" + a.id));
  } catch {}
  if (
    recovery &&
    recovery.revision === a.revision &&
    confirm("Recover your unsaved adaptation from this device?")
  ) {
    asset.data = recovery.data;
    dirty = true;
  } else if (recovery && recovery.revision !== a.revision)
    status(
      "A newer draft is saved remotely. The older recovery copy remains on this device.",
      true,
    );
  $("asset-editor").hidden = false;
  $("asset-title").value = asset.data.title;
  $("asset-text").value = asset.data.text;
  $("asset-parts").value = asset.data.parts.join("\n\n");
  $("asset-caption").value = asset.data.caption;
  $("carousel-template").value = asset.data.template;
  $("carousel-theme").value = asset.data.theme;
  $("asset-heading").textContent = `${asset.format} adaptation`;
  $("asset-state").textContent = `${asset.state} · revision ${asset.revision}`;
  $("asset-warning").hidden = !a.stale;
  $("asset-warning").textContent =
    "The original thought changed. You can keep editing this version; start a fresh adaptation before approving it.";
  $("carousel-editor").hidden = asset.format !== "carousel";
  $("text-editor").hidden = ["carousel", "thread"].includes(asset.format);
  $("parts-editor").hidden = !["thread", "video"].includes(asset.format);
  $("tracked-link").value = "";
  renderSlides();
  updateCounts();
}
function renderSlides() {
  if (!asset) return;
  $("photo-control").hidden = asset.data.template !== "photo";
  $("photo-control").querySelector("small").textContent =
    asset.data.photo?.startsWith("https:")
      ? "Uses your current website portrait. Choose a photograph to replace it."
      : "Stored privately with this draft. It becomes shareable when you export it.";
  $("slides-editor").replaceChildren();
  asset.data.slides.forEach((s, i) => {
    const row = document.createElement("section");
    row.className = "slide-row" + (i === slide ? " selected" : "");
    row.innerHTML = `<div class="preview-heading"><h3>Slide ${i + 1}</h3><button class="btn" data-action="preview">Preview</button></div><div class="form-group"><label for="slide-heading-${i}">Heading</label><input id="slide-heading-${i}" value="${escape(s.heading)}"></div><div class="form-group"><label for="slide-body-${i}">Words</label><textarea id="slide-body-${i}">${escape(s.body)}</textarea></div><div class="actions"><button class="btn" data-action="split">Split long slide</button><button class="btn" data-action="up" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn" data-action="down" ${i === asset.data.slides.length - 1 ? "disabled" : ""}>↓</button><button class="btn" data-action="remove">Remove</button></div>`;
    row.querySelector("input").addEventListener("input", (e) => {
      s.heading = e.target.value;
      slide = i;
      announceSaved();
      preview();
    });
    row.querySelector("textarea").addEventListener("input", (e) => {
      s.body = e.target.value;
      slide = i;
      announceSaved();
      preview();
    });
    row.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      if (action === "preview") {
        slide = i;
        preview();
        return;
      }
      if (action === "split") {
        const chunks = splitBody(s.body);
        if (chunks.length < 2) {
          status("This slide is already short. You can edit it directly.");
          return;
        }
        asset.data.slides.splice(
          i,
          1,
          ...chunks.map((body, n) => ({ heading: n ? "" : s.heading, body })),
        );
      }
      if (action === "up" || action === "down") {
        const j = i + (action === "up" ? -1 : 1);
        [asset.data.slides[i], asset.data.slides[j]] = [
          asset.data.slides[j],
          asset.data.slides[i],
        ];
        slide = j;
      }
      if (action === "remove") {
        asset.data.slides.splice(i, 1);
        slide = Math.min(slide, asset.data.slides.length - 1);
      }
      announceSaved();
      renderSlides();
    });
    $("slides-editor").append(row);
  });
  preview();
}
async function preview() {
  if (!asset || asset.format !== "carousel") return;
  asset.data = readData();
  const version = ++renderVersion,
    buffer = document.createElement("canvas");
  const result = await renderSlide(buffer, asset.data, slide);
  if (version !== renderVersion) return;
  $("slide-canvas").getContext("2d").drawImage(buffer, 0, 0);
  $("slide-fit").textContent = result.message;
  $("slide-fit").className = result.fits ? "status" : "auth-error";
  $("download-slide").disabled = !result.fits;
}
function updateCounts() {
  $("text-count").textContent =
    `${Array.from($("asset-text").value).length} characters`;
  $("parts-count").textContent = $("asset-parts")
    .value.split(/\n\s*\n/)
    .filter(Boolean)
    .map((p, i) => `${i + 1}: ${Array.from(p).length} characters`)
    .join(" · ");
}
async function save(approved = false) {
  if (!asset) throw Error("Choose a draft first.");
  clearTimeout(timer);
  const data = readData();
  if (approved && asset.format === "carousel") {
    for (let i = 0; i < data.slides.length; i++) {
      const c = document.createElement("canvas");
      if (!(await renderSlide(c, data, i)).fits)
        throw Error(
          `Slide ${i + 1} needs more room. Split it before approval.`,
        );
    }
  }
  const result = await api("/api/studio", {
    action: "save",
    postId: currentPost().id,
    id: asset.id,
    revision: asset.revision,
    data,
    state: approved ? "approved" : "draft",
    format: asset.format,
  });
  asset = { ...result.asset, stale: asset.stale };
  state.assets = state.assets.map((a) => (a.id === asset.id ? asset : a));
  dirty = false;
  try {
    localStorage.removeItem("john-studio-" + asset.id);
  } catch {}
  $("asset-save-state").textContent = "Saved in your studio.";
  $("asset-state").textContent = `${asset.state} · revision ${asset.revision}`;
  renderSaved();
  status(
    approved
      ? "Approved for use. You can export it when ready."
      : "Adaptation saved.",
  );
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function png(index) {
  if(dirty)await save();
  const canvas = document.createElement("canvas"),
    result = await renderSlide(canvas, readData(), index);
  if (!result.fits) throw Error(`Slide ${index + 1}: ${result.message}`);
  return new Uint8Array(
    await (
      await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
    ).arrayBuffer(),
  );
}
function switchView(view) {
  for (const section of document.querySelectorAll(".studio-view"))
    section.hidden = section.id !== "view-" + view;
  for (const tab of document.querySelectorAll("[data-view]"))
    tab.classList.toggle("active", tab.dataset.view === view);
  if (view === "insights") loadInsights().catch((e) => status(e.message, true));
  if (view === "email") loadSequence().catch((e) => status(e.message, true));
}
function renderVoice() {
  const v = state.voice;
  for (const k of ["principles", "avoid", "corrections", "cta"])
    $("voice-" + k).value = v[k] || "";
  $("voice-examples").replaceChildren();
  const selected = v.examples?.length
    ? v.examples
    : state.posts
        .filter((p) => p.status === "published")
        .slice(0, 3)
        .map((p) => p.id);
  for (const p of state.posts) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.value = p.id;
    input.checked = selected.includes(p.id);
    label.append(input, document.createTextNode(p.title));
    $("voice-examples").append(label);
  }
  renderInspiration();
}
function renderInspiration() {
  $("inspiration-list").innerHTML = state.inspiration
    .map(
      (item) =>
        `<article class="reference-item"><h3><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a></h3><p>${escape(item.notes)}</p><span class="status">${escape(item.kind)}</span><button class="btn" data-delete="${item.id}">Remove reference</button></article>`,
    )
    .join("");
  $("inspiration-list")
    .querySelectorAll("[data-delete]")
    .forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await api("/api/studio", {
            action: "delete-inspiration",
            id: b.dataset.delete,
          });
          state.inspiration = state.inspiration.filter(
            (i) => i.id !== b.dataset.delete,
          );
          renderInspiration();
        } catch (e) {
          status(e.message, true);
        }
      }),
    );
}
async function loadInsights() {
  const data = await api("/api/insights?days=" + $("insights-days").value),
    sum = (k) => data.readings.reduce((n, r) => n + Number(r[k] || 0), 0),
    total = sum("views");
  $("insights-results").innerHTML =
    `<div class="metric-grid"><div><strong>${total}</strong><span>Article visits</span></div><div><strong>${sum("engaged")}</strong><span>15+ visible seconds</span></div><div><strong>${sum("depth75")}</strong><span>Reached 75%</span></div><div><strong>${data.links.reduce((n, l) => n + l.clicks, 0)}</strong><span>Tracked link requests</span></div></div>${!total ? "<p>No reading data yet. New measurements will appear as people read.</p>" : ""}<h3>Article depth</h3>${[25, 50, 75, 100].map((q) => `<div class="depth-row"><span>${q}%</span><div class="depth-bar"><span style="width:${total ? Math.round(((data.depths["q" + q] || 0) / total) * 100) : 0}%"></span></div><span>${data.depths["q" + q] || 0}</span></div>`).join("")}<h3>Email signals · since tracking began</h3><p>${data.email.opens || 0} reported opens · ${data.email.clicks || 0} emails had a link request.</p><p class="status">Opens are estimates: mail apps can preload or block images. Link requests can include security scanners; reading time provides another signal.</p><h3>Your thoughts</h3>${data.readings.map((r) => `<article class="insight-row"><h3><a href="/post/${encodeURIComponent(r.slug)}/" target="_blank">${escape(r.title)}</a></h3><p class="insight-meta">${r.views} visits · ${r.engaged || 0} engaged · ${r.average_seconds || 0}s average visible reading · ${r.depth75 || 0} reached 75%</p><button class="btn" data-featured="${r.post_id}" data-enabled="${r.featured ? 0 : 1}">${r.featured ? "Remove from featured" : "Feature this thought"}</button></article>`).join("")}<h3>Links and subscriptions</h3><div class="table-scroll"><table><thead><tr><th>Channel</th><th>Adaptation</th><th>Link requests</th><th>Confirmed signups</th></tr></thead><tbody>${data.links.map((l) => `<tr><td>${escape(l.channel)}</td><td>${escape(l.asset_title || l.thought_title || l.thought_id)}<details><summary>Tracking ID</summary><code>${escape(l.asset_id || l.thought_id)}</code></details></td><td>${l.clicks}</td><td>${l.signups}</td></tr>`).join("")}</tbody></table></div><h3>Platform measurements</h3><p class="status">${data.social.length ? "Manually recorded results; social APIs are not connected." : "Record platform results on an adaptation until account connections are configured."}</p>${data.social.map((s) => `<p>${escape(s.format)} · ${s.views} views · ${s.saves} saves · ${s.shares} shares</p>`).join("")}`;
  $("insights-results")
    .querySelectorAll("[data-featured]")
    .forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await api("/api/studio", {
            action: "featured",
            postId: Number(b.dataset.featured),
            enabled: b.dataset.enabled === "1",
          });
          await loadInsights();
        } catch (e) {
          status(e.message, true);
        }
      }),
    );
}
async function loadSequence() {
  const data = await api("/api/reading-sequence");
  $("sequence-status").innerHTML =
    `<p><strong>${data.enabled ? "Daily catch-up is active" : "Daily catch-up is paused"}</strong></p><p>${data.confirmed} confirmed readers · ${data.pending} awaiting confirmation · ${data.reminderEligible} eligible for one reminder.</p><p class="status">${data.queue.map((q) => escape(q.title) + " · " + q.readers + " reader(s)").join("<br>") || "No catch-up messages are due right now."}</p>`;
  return data;
}
async function load() {
  state = await api("/api/studio");
  $("studio-login").hidden = true;
  $("studio-workspace").hidden = false;
  $("thought-select").replaceChildren();
  for (const p of state.posts) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.title + (p.status === "draft" ? " · private draft" : "");
    $("thought-select").append(o);
  }
  const requested = new URLSearchParams(location.search).get("post");
  if (state.posts.some((p) => p.id === Number(requested)))
    $("thought-select").value = requested;
  renderSaved();
  renderVoice();
  $("generate-adaptation").disabled = !state.aiConfigured;
  status("Your original writing and adaptations are stored separately.");
  switchView(new URLSearchParams(location.search).get("view") || "work");
}
$("studio-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/verify-password", { password: $("studio-password").value });
    $("studio-password").value = "";
    await load();
  } catch (error) {
    status(error.message, true);
  }
});
document
  .querySelectorAll("[data-view]")
  .forEach((tab) =>
    tab.addEventListener("click", () => switchView(tab.dataset.view)),
  );
$("thought-select").addEventListener("change", () => {
  if (dirty) {
    if (!confirm("Switch thoughts? Your edits have a local recovery copy.")) {
      $("thought-select").value = state.posts.find(
        (p) => p.thoughtId === asset.thought_id,
      )?.id;
      return;
    }
    persistRecovery();
  }
  clearTimeout(timer);
  asset = null;
  dirty = false;
  $("asset-editor").hidden = true;
  renderSaved();
});
for (const id of ["asset-title", "asset-text", "asset-parts", "asset-caption"])
  $(id).addEventListener("input", () => {
    announceSaved();
    updateCounts();
  });
for (const id of ["carousel-template", "carousel-theme"])
  $(id).addEventListener("change", () => {
    asset.data = readData();
    announceSaved();
    renderSlides();
  });
$("carousel-photo").addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (
      file.size > 8e6 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw Error("Choose a JPG, PNG, or WebP under 8 MB.");
    const image = await createImageBitmap(file),
      canvas = document.createElement("canvas"),
      scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.75,
      photo = canvas.toDataURL("image/jpeg", quality);
    while (photo.length > 390000 && quality > 0.2) {
      quality -= 0.1;
      photo = canvas.toDataURL("image/jpeg", quality);
    }
    if (photo.length > 400000)
      throw Error(
        "This photo is too large for the draft. Choose a smaller one.",
      );
    asset.data.photo = photo;
    announceSaved();
    await preview();
  } catch (error) {
    status(error.message, true);
  }
});
for (const [id, generate] of [
  ["generate-adaptation", true],
  ["start-adaptation", false],
])
  bind(id, async () => {
    if (
      dirty &&
      !confirm(
        "Start a new adaptation? Your current edits have a recovery copy.",
      )
    )
      return;
    status(
      generate
        ? "Drafting from your thought and voice guide…"
        : "Preparing an editable copy…",
    );
    const result = await api(generate ? "/api/repurpose" : "/api/studio", {
      action: "start",
      postId: currentPost().id,
      format: $("format-select").value,
      angle: $("angle-input").value,
    });
    state.assets.unshift(result.asset);
    openAsset(result.asset);
    renderSaved();
    status(
      generate
        ? "Draft ready. Read it against your original before approving."
        : "Ready to edit. Split long slides into one idea each.",
    );
  });
bind("save-adaptation", () => save());
bind("approve-adaptation", () => save(true));
bind("previous-slide", () => {
  slide = Math.max(0, slide - 1);
  return preview();
});
bind("next-slide", () => {
  slide = Math.min(asset.data.slides.length - 1, slide + 1);
  return preview();
});
bind("add-slide", () => {
  asset.data.slides.push({ heading: "", body: "" });
  slide = asset.data.slides.length - 1;
  announceSaved();
  renderSlides();
});
bind("download-slide", async () =>
  download(
    new Blob([await png(slide)], { type: "image/png" }),
    `${asset.id}-${slide + 1}.png`,
  ),
);
bind("download-all", async () => {
  const files = [];
  for (let i = 0; i < asset.data.slides.length; i++)
    files.push({
      name: `${String(i + 1).padStart(2, "0")}.png`,
      bytes: await png(i),
    });
  files.push({
    name: "caption.txt",
    bytes: new TextEncoder().encode(readData().caption),
  });
  download(zipFiles(files), `${asset.id}-carousel.zip`);
});
bind("copy-adaptation", async () => {
  const d = readData();
  await navigator.clipboard.writeText(
    [d.title, d.text, d.parts.join("\n\n"), d.caption, $("tracked-link").value]
      .filter(Boolean)
      .join("\n\n"),
  );
  status("Writing copied.");
});
bind("download-pack", () =>
  download(
    new Blob(
      [
        JSON.stringify(
          {
            thoughtId: currentPost().thoughtId,
            adaptationId: asset.id,
            sourceHash: asset.source_hash,
            format: asset.format,
            state: dirty ? "draft" : asset.state,
            ...readData(),
            readingLink: $("tracked-link").value,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    `${asset.id}-content.json`,
  ),
);
bind("make-link", async () => {
  if (!asset) throw Error("Save an adaptation first.");
  if(dirty)await save();
  const data = await api("/api/studio", {
    action: "link",
    postId: currentPost().id,
    assetId: asset.id,
    channel: $("link-channel").value,
  });
  $("tracked-link").value = data.url;
  status(
    "Reading link ready. Each request is attributed to this thought and adaptation.",
  );
});
bind("save-voice", async () => {
  const examples = [
    ...$("voice-examples").querySelectorAll("input:checked"),
  ].map((e) => Number(e.value));
  const result = await api("/api/studio", {
    action: "voice",
    voice: {
      revision: state.voice.revision,
      examples,
      ...Object.fromEntries(
        ["principles", "avoid", "corrections", "cta"].map((k) => [
          k,
          $("voice-" + k).value,
        ]),
      ),
    },
  });
  state.voice = result.voice;
  status("Voice guide saved for future drafts.");
});
bind("save-inspiration", async () => {
  const result = await api("/api/studio", {
    action: "inspiration",
    url: $("inspiration-url").value,
    title: $("inspiration-title").value,
    kind: $("inspiration-kind").value,
    notes: $("inspiration-notes").value,
  });
  state.inspiration.unshift(result.item);
  renderInspiration();
  status("Reference saved.");
});
for (const name of ["views", "likes", "saves", "shares", "comments"]) {
  const div = document.createElement("div");
  div.className = "form-group";
  div.innerHTML = `<label for="stat-${name}">${name[0].toUpperCase() + name.slice(1)}</label><input id="stat-${name}" type="number" min="0" value="0">`;
  $("social-stat-fields").append(div);
}
bind("save-social-stats", async () => {
  await api("/api/studio", {
    action: "social-stats",
    id: asset.id,
    stats: {
      url: $("platform-url").value,
      ...Object.fromEntries(
        ["views", "likes", "saves", "shares", "comments"].map((k) => [
          k,
          Number($("stat-" + k).value),
        ]),
      ),
    },
  });
  status("Platform measurements saved with this adaptation’s ID.");
});
$("insights-days").addEventListener("change", () =>
  loadInsights().catch((e) => status(e.message, true)),
);
bind("preview-sequence", loadSequence);
for (const [id, enabled] of [
  ["enable-sequence", true],
  ["pause-sequence", false],
])
  bind(id, async () => {
    await api("/api/reading-sequence", { action: "enabled", enabled });
    await loadSequence();
    status(
      enabled
        ? "Daily catch-up enabled for confirmed readers."
        : "Catch-up paused. New-post announcements keep their publication setting.",
    );
  });
bind("send-reminders", async () => {
  const preview = await loadSequence();
  if (!preview.reminderEligible) {
    status("No pending readers are eligible for a reminder.");
    return;
  }
  if (
    !confirm(
      `Queue one confirmation reminder for ${preview.reminderEligible} eligible pending readers?`,
    )
  )
    return;
  await api("/api/reading-sequence", { action: "reminders" });
  await loadSequence();
  status("One reminder per eligible pending reader is queued.");
});
addEventListener("beforeunload", (e) => {
  if (dirty) {
    persistRecovery();
    e.preventDefault();
    e.returnValue = "";
  }
});
(async () => {
  try {
    const session = await api("/api/verify-password");
    if (!session.authenticated) {
      $("studio-login").hidden = false;
      status("Unlock with your existing Writer’s room password.");
      return;
    }
    await load();
  } catch (error) {
    status(error.message, true);
  }
})();
