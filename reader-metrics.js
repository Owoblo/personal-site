(() => {
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  const query = new URLSearchParams(location.search);
  let attribution = query.get("via") || "";
  try {
    if (/^[a-f0-9-]{36}$/.test(attribution))
      sessionStorage.setItem(
        "john-reading-link",
        JSON.stringify({ id: attribution, expires: Date.now() + 7200000 }),
      );
    else {
      const old = JSON.parse(sessionStorage.getItem("john-reading-link"));
      if (old?.expires > Date.now()) attribution = old.id;
    }
  } catch {}
  for (const form of document.querySelectorAll(
    'form[action="/api/subscribe"]',
  )) {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "attribution_link";
    field.value = attribution;
    form.append(field);
  }
  const article = document.querySelector("[data-thought-id]");
  if (!article) return;
  const id = crypto.randomUUID(),
    thought = article.dataset.thoughtId;
  let seconds = 0,
    depth = 0,
    sequence = 0,
    lastSent = 0;
  function measure() {
    const rect = article.getBoundingClientRect();
    const progress = Math.max(
      0,
      Math.min(1, (innerHeight - rect.top) / Math.max(1, rect.height)),
    );
    return progress >= 0.98 ? 100 : Math.floor(progress * 4) * 25;
  }
  function send() {
    if (seconds < 2 || (!seconds && !depth)) return;
    const payload = JSON.stringify({
      id,
      thought,
      seconds: Math.min(1800, seconds),
      depth,
      sequence: ++sequence,
      link: query.get("via") || "",
      channel: query.get("utm_source") || "direct",
      referrer: document.referrer,
    });
    navigator.sendBeacon(
      "/api/insights",
      new Blob([payload], { type: "application/json" }),
    );
    lastSent = seconds;
  }
  setInterval(() => {
    if (
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      seconds >= 1800
    )
      return;
    const rect = article.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    seconds++;
    const next = measure();
    if (next > depth) {
      depth = next;
      send();
    } else if (seconds === 2 || seconds - lastSent >= 30) send();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send();
  });
  addEventListener("pagehide", send);
})();
