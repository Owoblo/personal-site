import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers/d1.mjs";
import { createSessionCookie } from "../functions/_lib/auth.js";
import {
  onRequestGet as getStudio,
  onRequestPost as studio,
} from "../functions/api/studio.js";
import { onRequestPost as generate } from "../functions/api/repurpose.js";
import {
  onRequestPost as collect,
  onRequestGet as insights,
} from "../functions/api/insights.js";
import { onRequestGet as redirect } from "../functions/r/[[id]].js";
import { onRequestGet as openPixel } from "../functions/email-open/[[id]].js";
import {
  defaultVoice,
  syncThoughts,
  thoughtId,
  createLink,
  sourceHash,
} from "../functions/_lib/studio.mjs";
import {
  queueReadingSequence,
  sequencePreview,
  sendConfirmationReminders,
} from "../functions/_lib/reading-sequence.mjs";
import { processSesOutbox } from "../functions/_lib/ses-outbox.mjs";
import { deliveryLinks } from "../functions/_lib/email-engagement.mjs";
import { unsubscribeUrl } from "../functions/_lib/newsletter-store.mjs";
import {
  onRequestGet as preferencesGet,
  onRequestPost as preferencesPost,
} from "../functions/api/unsubscribe.js";
import { splitBody, zipFiles } from "../studio-render.mjs";
const original = {
  id: 1,
  slug: "one-real-thought",
  title: "An observation",
  status: "published",
  date: "2026-08-01",
  content:
    "<p>I kept thinking about the distance between intention and action.</p><p>Some things take time.</p>",
  excerpt: "An observation about intention.",
};
async function setup(t) {
  const db = testDatabase();
  t.after(() => db.close());
  let posts = [
    structuredClone(original),
    { ...original, id: 2, slug: "private-draft", status: "draft" },
  ];
  const env = {
    NEWSLETTER_DB: db,
    ADMIN_PASSWORD: "studio-test",
    NEWSLETTER_SENDING_ENABLED: "true",
    NEWSLETTER_PROVIDER: "ses",
    AWS_SES_ACCESS_KEY_ID: "test",
    AWS_SES_SECRET_ACCESS_KEY: "test",
    NEWSLETTER_UNSUBSCRIBE_SECRET: "a".repeat(64),
    ASSETS: { fetch: async () => Response.json({ posts }) },
  };
  await syncThoughts(db, posts);
  const cookie = (await createSessionCookie(env.ADMIN_PASSWORD)).split(";")[0];
  return {
    db,
    env,
    posts,
    cookie,
    context(path = "/api/studio", body, auth = true) {
      return {
        env,
        request: new Request("https://johnowolabi.com" + path, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            Cookie: auth ? cookie : "",
            Origin: "https://johnowolabi.com",
            "User-Agent": "Mozilla/5.0",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      };
    },
  };
}
test("studio content, voice, generation, and insights require owner authentication", async (t) => {
  const s = await setup(t);
  for (const handler of [getStudio, studio, generate, insights])
    assert.equal(
      (await handler(s.context("/api/studio", undefined, false))).status,
      401,
    );
});
test("adaptations preserve the original and reject stale saves and stale approval", async (t) => {
  const s = await setup(t),
    before = JSON.stringify(s.posts);
  const created = await (
    await studio(
      s.context("/api/studio", {
        action: "start",
        postId: 1,
        format: "carousel",
        angle: "Intention",
      }),
    )
  ).json();
  const asset = created.asset;
  assert.equal(asset.thought_id, "thought-1");
  const save = {
    action: "save",
    postId: 1,
    id: asset.id,
    revision: 1,
    data: {
      ...asset.data,
      title: "A different angle",
      template: "reading",
      theme: "mixed",
      slides: [
        {
          heading: "A fuller passage",
          body: Array(80).fill("thought").join(" "),
        },
      ],
    },
    state: "approved",
    format: "carousel",
  };
  assert.equal((await studio(s.context("/api/studio", save))).status, 200);
  const storedData = JSON.parse(
    (
      await s.db
        .prepare("SELECT data FROM studio_assets WHERE id=?")
        .bind(asset.id)
        .first()
    ).data,
  );
  assert.equal(storedData.template, "reading");
  assert.equal(storedData.theme, "mixed");
  assert.equal((await studio(s.context("/api/studio", save))).status, 409);
  assert.equal(JSON.stringify(s.posts), before);
  assert.equal(
    (await s.db.prepare("SELECT COUNT(*) AS n FROM studio_versions").first()).n,
    1,
  );
  s.posts[0].content = "<p>A newer original.</p>";
  assert.equal(
    (
      await studio(
        s.context("/api/studio", { ...save, revision: 2, state: "approved" }),
      )
    ).status,
    400,
  );
  const loaded = await (await getStudio(s.context())).json();
  assert.equal(loaded.assets[0].stale, true);
});
test("voice guide persists with concurrency protection and private inspiration URLs are validated", async (t) => {
  const s = await setup(t),
    voice = {
      ...defaultVoice,
      revision: 0,
      examples: [1],
      corrections: "Keep the uncertainty.",
    };
  assert.equal(
    (await studio(s.context("/api/studio", { action: "voice", voice }))).status,
    200,
  );
  assert.equal(
    (await studio(s.context("/api/studio", { action: "voice", voice }))).status,
    409,
  );
  assert.equal(
    (
      await studio(
        s.context("/api/studio", {
          action: "inspiration",
          url: "javascript:alert(1)",
          title: "bad",
          notes: "",
        }),
      )
    ).status,
    400,
  );
  const loaded = await (await getStudio(s.context())).json();
  assert.equal(loaded.voice.corrections, voice.corrections);
});
test("AI generation uses bounded source and voice examples and saves an unapproved draft", async (t) => {
  const s = await setup(t);
  s.env.OPENAI_API_KEY = "test";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.type, "json_schema");
    assert.match(body.messages[1].content, /intention and action/);
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              title: "The distance",
              text: "A thoughtful adaptation.",
              caption: "Read the full thought.",
              slides: [],
              parts: [],
            }),
          },
        },
      ],
    });
  });
  const response = await generate(
    s.context("/api/repurpose", {
      postId: 1,
      format: "linkedin",
      angle: "The distance",
    }),
  );
  assert.equal(response.status, 200);
  const { asset } = await response.json();
  assert.equal(asset.state, "draft");
  assert.equal(asset.thought_id, "thought-1");
  assert.equal(s.posts[0].title, original.title);
});
test("owned short links attribute requests, exclude HEAD and bots, and cannot redirect externally", async (t) => {
  const s = await setup(t),
    link = await createLink(s.db, {
      thought: "thought-1",
      channel: "instagram",
      target: "https://johnowolabi.com/post/one-real-thought/",
    });
  const context = {
    env: s.env,
    params: { id: link.id },
    request: new Request(link.url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }),
  };
  const result = await redirect(context);
  assert.equal(result.status, 302);
  assert.equal(
    new URL(result.headers.get("Location")).searchParams.get("utm_source"),
    "instagram",
  );
  await redirect({
    ...context,
    request: new Request(link.url, { method: "HEAD" }),
  });
  await redirect({
    ...context,
    request: new Request(link.url, {
      headers: { "User-Agent": "facebookexternalhit" },
    }),
  });
  assert.equal(
    (await s.db.prepare("SELECT requests FROM studio_link_days").first())
      .requests,
    1,
  );
  await s.db
    .prepare("UPDATE studio_links SET target='https://example.com/' WHERE id=?")
    .bind(link.id)
    .run();
  assert.equal((await redirect(context)).status, 404);
});
test("anonymous reading events deduplicate, ignore older updates, and exclude owner traffic", async (t) => {
  const s = await setup(t),
    event = {
      id: crypto.randomUUID(),
      thought: "thought-1",
      seconds: 20,
      depth: 50,
      sequence: 2,
      channel: "x",
      referrer: "https://example.com/private-query?q=secret",
    };
  assert.equal(
    (await collect(s.context("/api/insights", event, false))).status,
    204,
  );
  await collect(
    s.context(
      "/api/insights",
      { ...event, seconds: 5, depth: 25, sequence: 1 },
      false,
    ),
  );
  await collect(
    s.context("/api/insights", { ...event, id: crypto.randomUUID() }, true),
  );
  const data = await (await insights(s.context("/api/insights"))).json();
  assert.equal(data.readings.find((r) => r.id === "thought-1").views, 1);
  assert.equal(
    data.readings.find((r) => r.id === "thought-1").average_seconds,
    20,
  );
  const saved = await s.db.prepare("SELECT * FROM studio_readings").first();
  assert.equal(saved.referrer, "example.com");
  assert.equal(saved.depth, 50);
  assert.equal(
    (
      await collect(
        s.context(
          "/api/insights",
          { ...event, id: crypto.randomUUID(), thought: "thought-2" },
          false,
        ),
      )
    ).status,
    404,
  );
});
test("email links and pixel count approximate engagement without exposing subscriber information", async (t) => {
  const s = await setup(t),
    campaign = { id: crypto.randomUUID() },
    id = crypto.randomUUID();
  const one = await deliveryLinks(s.db, campaign, id, original),
    two = await deliveryLinks(s.db, campaign, id, original);
  assert.equal(one.articleUrl, two.articleUrl);
  const linkId = one.articleUrl.split("/").pop(),
    pixelId = one.pixelUrl.split("/").pop();
  await redirect({
    env: s.env,
    params: { id: linkId },
    request: new Request(one.articleUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }),
  });
  const pixel = await openPixel({
    env: s.env,
    params: { id: pixelId },
    request: new Request(one.pixelUrl),
  });
  assert.equal(pixel.headers.get("Content-Type"), "image/gif");
  const row = await s.db.prepare("SELECT * FROM newsletter_engagement").first();
  assert.ok(row.opened_at);
  assert.ok(row.clicked_at);
  assert.equal(row.open_count, 1);
});
async function contact(db, email, status, created = "2026-07-01T00:00:00Z") {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO newsletter_contacts(id,email,status,source,created_at,confirmed_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      email,
      status,
      "website",
      created,
      status === "confirmed" ? created : null,
      created,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO newsletter_preferences(contact_id,archive_enabled,sequence_floor) VALUES (?,1,'1970-01-01')",
    )
    .bind(id)
    .run();
  return id;
}
test("archive queue respects consent, join-date floors, pause, per-reader daily pace and duplicate prevention", async (t) => {
  const s = await setup(t),
    id = await contact(s.db, "reader@example.com", "confirmed"),
    pending = await contact(s.db, "pending@example.com", "pending");
  await s.db
    .prepare(
      "INSERT INTO studio_settings(id,data,updated_at) VALUES ('reading-sequence','{\"enabled\":true}',?)",
    )
    .bind(new Date().toISOString())
    .run();
  assert.equal((await sequencePreview(s.db, s.posts)).candidates.length, 1);
  await queueReadingSequence(s.env, s.posts);
  let sent = 0;
  t.mock.method(globalThis, "fetch", async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    if (request.url.includes("/suppression/"))
      return new Response("{}", { status: 404 });
    sent++;
    return Response.json({ MessageId: "message-" + sent });
  });
  assert.equal((await processSesOutbox(s.env, s.posts)).submitted, 1);
  assert.equal((await sequencePreview(s.db, s.posts)).candidates.length, 0);
  assert.equal(sent, 1);
  assert.equal(
    (
      await s.db
        .prepare(
          "SELECT COUNT(*) AS n FROM newsletter_deliveries WHERE contact_id=?",
        )
        .bind(pending)
        .first()
    ).n,
    0,
  );
  await s.db
    .prepare(
      "UPDATE newsletter_preferences SET sequence_floor='2026-09-01' WHERE contact_id=?",
    )
    .bind(id)
    .run();
  await s.db
    .prepare("UPDATE newsletter_deliveries SET sent_at='2026-01-01T00:00:00Z'")
    .run();
  assert.equal((await sequencePreview(s.db, s.posts)).candidates.length, 0);
});
test("confirmation reminders are limited to recent pending subscribers and sent at most once", async (t) => {
  const s = await setup(t),
    recent = new Date(Date.now() - 7 * 86400000).toISOString();
  await contact(s.db, "pending@example.com", "pending", recent);
  await contact(
    s.db,
    "very-old@example.com",
    "pending",
    "2020-01-01T00:00:00Z",
  );
  await s.db
    .prepare(
      "INSERT INTO studio_settings(id,data,updated_at) VALUES ('confirmation-reminders','{\"enabled\":true}',?)",
    )
    .bind(recent)
    .run();
  let sent = 0;
  t.mock.method(globalThis, "fetch", async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    if (request.url.includes("/suppression/"))
      return new Response("{}", { status: 404 });
    sent++;
    return Response.json({ MessageId: "reminder" });
  });
  assert.equal(await sendConfirmationReminders(s.env), 1);
  assert.equal(await sendConfirmationReminders(s.env), 0);
  assert.equal(sent, 1);
});
test("readers can pause and resume archive mail without reactivating an unsubscribed address", async (t) => {
  const s = await setup(t),
    id = await contact(s.db, "reader@example.com", "confirmed");
  const url = await unsubscribeUrl(s.env, id);
  for (const [action, expected] of [
    ["archive-off", 0],
    ["archive-on", 1],
  ]) {
    const response = await preferencesPost({
      env: s.env,
      request: new Request(url, {
        method: "POST",
        body: new URLSearchParams({ action }),
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(
      (
        await s.db
          .prepare(
            "SELECT archive_enabled FROM newsletter_preferences WHERE contact_id=?",
          )
          .bind(id)
          .first()
      ).archive_enabled,
      expected,
    );
    assert.equal(
      (
        await s.db
          .prepare("SELECT status FROM newsletter_contacts WHERE id=?")
          .bind(id)
          .first()
      ).status,
      "confirmed",
    );
    assert.match(
      await (
        await preferencesGet({ env: s.env, request: new Request(url) })
      ).text(),
      expected ? /Pause earlier thoughts/ : /Resume earlier thoughts/,
    );
  }
  await s.db
    .prepare("UPDATE newsletter_contacts SET status='unsubscribed' WHERE id=?")
    .bind(id)
    .run();
  assert.equal(
    (
      await preferencesPost({
        env: s.env,
        request: new Request(url, {
          method: "POST",
          body: new URLSearchParams({ action: "archive-on" }),
        }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await s.db
        .prepare("SELECT status FROM newsletter_contacts WHERE id=?")
        .bind(id)
        .first()
    ).status,
    "unsubscribed",
  );
});
test("confirmation reminder batches exclude contacts who joined after the selected cohort", async (t) => {
  const s = await setup(t),
    now = Date.now();
  await contact(
    s.db,
    "earlier@example.com",
    "pending",
    new Date(now - 10 * 86400000).toISOString(),
  );
  await contact(
    s.db,
    "later@example.com",
    "pending",
    new Date(now - 5 * 86400000).toISOString(),
  );
  await s.db
    .prepare(
      "INSERT INTO studio_settings(id,data,updated_at) VALUES ('confirmation-reminders',?,?)",
    )
    .bind(
      JSON.stringify({
        enabled: true,
        before: new Date(now - 7 * 86400000).toISOString(),
      }),
      new Date(now).toISOString(),
    )
    .run();
  t.mock.method(globalThis, "fetch", async (input) =>
    new URL(input instanceof Request ? input.url : input).pathname.includes(
      "/suppression/",
    )
      ? new Response("{}", { status: 404 })
      : Response.json({ MessageId: "reminder" }),
  );
  assert.equal(await sendConfirmationReminders(s.env), 1);
  assert.equal(await sendConfirmationReminders(s.env), 0);
});
test("slide splitting preserves all words and ZIP export contains a valid central directory", async () => {
  const words = Array.from({ length: 130 }, (_, i) => "word" + i).join(" "),
    parts = splitBody(words);
  assert.deepEqual(parts.join(" ").split(" "), words.split(" "));
  assert.ok(parts.every((p) => p.split(" ").length <= 45));
  const zip = zipFiles([
    { name: "caption.txt", bytes: new TextEncoder().encode("My words.") },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(
    new DataView(bytes.buffer).getUint32(bytes.length - 22, true),
    0x06054b50,
  );
});
