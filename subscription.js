(() => {
  if (window.johnSubscriptionReady) return;
  window.johnSubscriptionReady = true;
  const key = "john-newsletter-state",
    dismissedKey = "john-newsletter-dismissed";
  const read = (name) => {
    try {
      return JSON.parse(localStorage.getItem(name));
    } catch {
      return null;
    }
  };
  const store = (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {}
  };
  const confirmed = () =>
    document.cookie
      .split(";")
      .some((c) => c.trim() === "john_newsletter=confirmed");
  const pending = () => {
    const saved = read(key);
    return saved?.status === "pending" && saved.expires > Date.now();
  };
  const forms = new WeakSet();
  let prompt,
    seconds = 0;
  const closePrompt = () => {
    if (prompt) prompt.hidden = true;
  };
  function message(form) {
    const box = form.closest("[data-subscribe-box]") || form.parentElement;
    let status = box.querySelector(".subscription-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "subscription-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      box.append(status);
    }
    return status;
  }
  function joined(form) {
    const box = form.closest("[data-subscribe-box]") || form.parentElement;
    form.hidden = true;
    box
      .querySelectorAll(".archive-choice,.subscription-note")
      .forEach((el) => (el.hidden = true));
    message(form).textContent = "You’re subscribed. Glad you’re here.";
  }
  function enhance() {
    document
      .querySelectorAll('form[action="/api/subscribe"]')
      .forEach((form) => {
        if (forms.has(form)) return;
        forms.add(form);
        const email = form.elements.email;
        if (email) {
          email.autocomplete = "email";
          email.inputMode = "email";
          email.setAttribute("autocapitalize", "none");
          email.spellcheck = false;
        }
        if (confirmed()) {
          joined(form);
          return;
        }
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (form.dataset.sending || !form.reportValidity()) return;
          form.dataset.sending = "true";
          const button = form.querySelector('[type="submit"]'),
            old = button.textContent;
          button.disabled = true;
          button.textContent = "Sending…";
          form.setAttribute("aria-busy", "true");
          const status = message(form);
          status.textContent = "";
          try {
            const body = new FormData(form);
            if (
              navigator.doNotTrack !== "1" &&
              !navigator.globalPrivacyControl &&
              !body.get("attribution_link")
            ) {
              let via = new URLSearchParams(location.search).get("via");
              try {
                const saved = JSON.parse(
                  sessionStorage.getItem("john-reading-link"),
                );
                if (!via && saved?.expires > Date.now()) via = saved.id;
              } catch {}
              if (/^[a-f0-9-]{36}$/.test(via || ""))
                body.set("attribution_link", via);
            }
            const response = await fetch("/api/subscribe", {
              method: "POST",
              headers: { Accept: "application/json" },
              body,
            });
            const result = await response
              .json()
              .catch(() => ({
                success: false,
                message: "Please try again in a moment.",
              }));
            if (!response.ok || !result.success)
              throw Error(result.message || "Please try again in a moment.");
            store(key, {
              status: "pending",
              expires: Date.now() + 7 * 86400000,
            });
            closePrompt();
            status.textContent = result.message;
            form.hidden = true;
            const box =
              form.closest("[data-subscribe-box]") || form.parentElement;
            box
              .querySelectorAll(".archive-choice,.subscription-note")
              .forEach((el) => (el.hidden = true));
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "subscription-reset";
            reset.textContent = "Use a different email";
            reset.addEventListener("click", () => {
              form.hidden = false;
              email.value = "";
              status.textContent = "";
              reset.remove();
              box
                .querySelectorAll(".archive-choice,.subscription-note")
                .forEach((el) => (el.hidden = false));
              email.focus();
            });
            status.after(reset);
          } catch (error) {
            status.textContent =
              error instanceof TypeError
                ? "Couldn’t connect. Your email is still here—please try again."
                : error.message;
          } finally {
            delete form.dataset.sending;
            form.removeAttribute("aria-busy");
            button.disabled = false;
            button.textContent = old;
          }
        });
      });
  }
  enhance();
  new MutationObserver(enhance).observe(document.body, {
    childList: true,
    subtree: true,
  });
  function considerPrompt() {
    if (confirmed() || pending() || read(dismissedKey) > Date.now()) {
      closePrompt();
      return;
    }
    const form = document.querySelector('form[action="/api/subscribe"]');
    if (
      !form ||
      form.hidden ||
      seconds < 30 ||
      document.activeElement?.matches("input,textarea,select")
    )
      return;
    const rect = form.getBoundingClientRect();
    if (rect.top < innerHeight && rect.bottom > 0) {
      closePrompt();
      return;
    }
    const reading =
      document.querySelector(".post-body") ||
      document.querySelector(".thoughts-preview") ||
      document.querySelector(".thoughts-list");
    if (!reading || reading.getBoundingClientRect().top > innerHeight / 2)
      return;
    if (document.querySelector(".post-body")) {
      const r = reading.getBoundingClientRect();
      if ((innerHeight - r.top) / Math.max(r.height, 1) < 0.45) return;
    }
    if (prompt) {
      prompt.hidden = false;
      return;
    }
    prompt = document.createElement("aside");
    prompt.className = "subscription-prompt";
    prompt.setAttribute("aria-label", "Email reading invitation");
    const copy = document.createElement("span");
    copy.textContent = "Keep thinking with me. Get the next thought by email.";
    const go = document.createElement("a");
    go.href = "#subscribe";
    go.textContent = "Subscribe";
    go.addEventListener("click", (event) => {
      event.preventDefault();
      closePrompt();
      store(dismissedKey, Date.now() + 7 * 86400000);
      form.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      form.elements.email.focus({ preventScroll: true });
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss email invitation");
    dismiss.addEventListener("click", () => {
      store(dismissedKey, Date.now() + 7 * 86400000);
      closePrompt();
    });
    prompt.append(copy, go, dismiss);
    document.body.append(prompt);
  }
  setInterval(() => {
    if (document.visibilityState === "visible" && document.hasFocus())
      seconds++;
    considerPrompt();
  }, 1000);
  addEventListener("scroll", considerPrompt, { passive: true });
})();
