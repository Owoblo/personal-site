const videoFormats = [
  {
    id: "camera",
    title: "A calm conversation",
    length: "45–75 seconds",
    idea: "One thought, spoken directly to the camera.",
    direction:
      "Open with the observation. Add one personal example already in the essay. Keep natural pauses and end with the thought, rather than a lesson.",
    setup: "Phone at eye level, quiet room, one comfortable take.",
  },
  {
    id: "voiceover",
    title: "Everyday footage + voiceover",
    length: "35–60 seconds",
    idea: "Let an ordinary scene carry a deeper observation.",
    direction:
      "Use your own footage: a notebook, a walk, a desk, light through a window. Voice stays clear; music is optional and stays underneath it.",
    setup:
      "Record the voice first. Choose a few shots that leave room to listen.",
  },
  {
    id: "observation",
    title: "One observation",
    length: "15–30 seconds",
    idea: "One line worth sitting with, then a little context.",
    direction:
      "Start with the strongest line from the thought. One sentence of explanation, then stop. It does not need a reading invitation every time.",
    setup: "A still frame, direct voice, no elaborate introduction.",
  },
  {
    id: "story",
    title: "A small story",
    length: "60–90 seconds",
    idea: "Something happened. It made you notice something.",
    direction:
      "Use a scene that actually appears in the essay. Tell what happened, what you noticed, and what remains unresolved. Do not invent a more dramatic story.",
    setup:
      "Talk to the camera or use a voiceover. Let the turn in the story carry the edit.",
  },
  {
    id: "two-angles",
    title: "Two ways of seeing it",
    length: "45–75 seconds",
    idea: "Explore a contradiction without forcing an answer.",
    direction:
      "Say what you used to think, then what complicates it now. Hold the nuance. A change of framing can be enough; no staged argument is required.",
    setup: "One person, two short sections, a clear pause between them.",
  },
  {
    id: "building",
    title: "From the workbench",
    length: "45–90 seconds",
    idea: "A real building decision becomes a wider thought.",
    direction:
      "Show one actual process, trade-off or small failure already described in the source. Explain the observation without invented results or private client details.",
    setup:
      "A screen or physical task, with a clear voice explaining what you noticed.",
  },
];
const names = {
  carousel: "Carousels",
  tweet: "Tweets",
  thread: "Threads",
  video: "Video briefs",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mountOrganizer(context) {
  const { state, choosePost, openAsset, switchView, status, api } = context;
  const guarded = (fn) => async (event) => {
    try {
      await fn(event);
    } catch (error) {
      status(error.message, true);
    }
  };
  async function open(item) {
    const post = state.posts.find((p) => p.thoughtId === item.thought_id);
    if (!post || !choosePost(post.id)) return;
    switchView("work");
    await openAsset(item);
  }
  function render() {
    const query = document.getElementById("library-search").value.toLowerCase(),
      filter = document.getElementById("library-source").value;
    const posts = state.posts
      .filter(
        (p) =>
          p.title.toLowerCase().includes(query) &&
          (filter === "all" || p.status === filter),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
    document.getElementById("library-summary").textContent =
      `${state.posts.length} thoughts · ${state.assets.length} saved adaptations · originals kept separate`;
    document.getElementById("library-results").innerHTML =
      posts
        .map((post) => {
          const assets = state.assets.filter(
            (a) => a.thought_id === post.thoughtId,
          );
          const groups = Object.entries(names).filter(([format]) =>
            assets.some((a) => a.format === format),
          );
          return `<article class="thought-package"><div class="preview-heading"><h3>${esc(post.title)}</h3><span class="status">${post.status === "draft" ? "Private source draft" : "Published thought"}</span></div><div class="package-coverage">${[
            "carousel",
            "tweet",
            "thread",
            "video",
          ]
            .map((format) => {
              const items = assets.filter((a) => a.format === format);
              return `<span>${names[format]}: ${items.length || "not prepared yet"}</span>`;
            })
            .join("")}</div>${groups
            .map(
              ([format, label]) =>
                `<details><summary>${label} · ${assets.filter((a) => a.format === format).length}</summary><div class="package-assets">${assets
                  .filter((a) => a.format === format)
                  .map(
                    (a) =>
                      `<button class="btn" data-open="${a.id}">${esc(a.angle || a.data.title || label)} · ${a.stale ? "source changed" : a.state === "approved" ? "reviewed" : "draft"}</button>`,
                  )
                  .join("")}</div></details>`,
            )
            .join(
              "",
            )}<button class="btn" data-prepare="${post.id}">Open thought workspace</button></article>`;
        })
        .join("") || "<p>No matching thoughts.</p>";
    document
      .querySelectorAll("[data-open]")
      .forEach(
        (button) =>
          (button.onclick = guarded(() =>
            open(state.assets.find((a) => a.id === button.dataset.open)),
          )),
      );
    document.querySelectorAll("[data-prepare]").forEach(
      (button) =>
        (button.onclick = () => {
          if (choosePost(Number(button.dataset.prepare))) switchView("work");
        }),
    );
    document.getElementById("video-thought-select").innerHTML = state.posts
      .map(
        (p) =>
          `<option value="${p.id}" ${String(p.id) === document.getElementById("thought-select").value ? "selected" : ""}>${esc(p.title)}</option>`,
      )
      .join("");
    document.getElementById("video-briefs").innerHTML =
      state.assets
        .filter((a) => a.format === "video")
        .map(
          (a) =>
            `<button class="btn" data-video-asset="${a.id}">${esc(a.data.title)} · ${a.stale ? "source changed" : a.state}</button>`,
        )
        .join("") || "<p>Choose a format below to begin a recording brief.</p>";
    document
      .querySelectorAll("[data-video-asset]")
      .forEach(
        (button) =>
          (button.onclick = guarded(() =>
            open(state.assets.find((a) => a.id === button.dataset.videoAsset)),
          )),
      );
  }
  document.getElementById("library-search").oninput = render;
  document.getElementById("library-source").onchange = render;
  document.getElementById("video-formats").innerHTML = videoFormats
    .map(
      (format) =>
        `<article class="thought-package"><h3>${format.title}</h3><p class="status">${format.length} · a starting estimate</p><p>${format.idea}</p><p>${format.direction}</p><p class="status">${format.setup}</p><button class="btn" data-video-format="${format.id}">Use for the selected thought</button></article>`,
    )
    .join("");
  document.querySelectorAll("[data-video-format]").forEach(
    (button) =>
      (button.onclick = () => {
        const format = videoFormats.find(
          (f) => f.id === button.dataset.videoFormat,
        );
        if (
          !choosePost(
            Number(document.getElementById("video-thought-select").value),
          )
        )
          return;
        document.getElementById("format-select").value = "video";
        document.getElementById("angle-input").value =
          `${format.title}. ${format.direction} ${format.setup} Aim for ${format.length}. Use only source-supported scenes and experiences; provide spoken beats and a practical recording brief.`;
        switchView("work");
        document.getElementById("angle-input").focus();
        status(
          "Video direction selected. Start from the original or draft with AI.",
        );
      }),
  );
  async function loadQueue() {
    const result = await api("/api/content-queue");
    const items = result.items.filter((i) => i.state !== "cancelled");
    document.getElementById("queue-results").innerHTML =
      items
        .map(
          (item) =>
            `<article class="thought-package"><div class="preview-heading"><h3>${esc(item.title)}</h3><span>${esc(item.channel)}</span></div><p>${esc(item.hold)}</p><p class="status">Reviewed revision ${item.asset_revision}${item.not_before ? " · planned " + esc(new Date(item.not_before).toLocaleString()) : ""}</p><div class="actions"><button class="btn" data-queue-open="${item.asset_id}">Open adaptation</button><button class="btn" data-queue-action="${item.state === "paused" ? "resume" : "pause"}" data-id="${item.id}">${item.state === "paused" ? "Resume" : "Pause"}</button><button class="btn" data-queue-action="remove" data-id="${item.id}">Remove</button></div></article>`,
        )
        .join("") ||
      "<p>Your ready queue is empty. Review an adaptation, then add its approved version.</p>";
    document
      .querySelectorAll("[data-queue-open]")
      .forEach(
        (button) =>
          (button.onclick = guarded(() =>
            open(state.assets.find((a) => a.id === button.dataset.queueOpen)),
          )),
      );
    document.querySelectorAll("[data-queue-action]").forEach(
      (button) =>
        (button.onclick = guarded(async () => {
          await api("/api/content-queue", {
            action: button.dataset.queueAction,
            id: button.dataset.id,
          });
          await loadQueue();
        })),
    );
  }
  render();
  return { render, loadQueue };
}
