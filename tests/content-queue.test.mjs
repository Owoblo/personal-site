import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers/d1.mjs";
import { createSessionCookie } from "../functions/_lib/auth.js";
import { sourceHash, syncThoughts } from "../functions/_lib/studio.mjs";
import {
  onRequestGet as inspect,
  onRequestPost as mutate,
} from "../functions/api/content-queue.js";
async function setup(t) {
  const db = testDatabase();
  t.after(() => db.close());
  const posts = [
    {
      id: 1,
      title: "A thought",
      slug: "a-thought",
      content: "<p>One honest observation.</p>",
      status: "published",
    },
    {
      id: 2,
      title: "Private",
      slug: "private",
      content: "<p>Private writing.</p>",
      status: "draft",
    },
  ];
  const env = {
    NEWSLETTER_DB: db,
    ADMIN_PASSWORD: "queue-fixture",
    ASSETS: { fetch: async () => Response.json({ posts }) },
  };
  await syncThoughts(db, posts);
  const cookie = (await createSessionCookie(env.ADMIN_PASSWORD)).split(";")[0];
  return {
    db,
    posts,
    env,
    async asset(
      id = "asset",
      format = "tweet",
      state = "approved",
      post = posts[0],
    ) {
      const data = {
        title: post.title,
        text: "One honest observation.",
        parts: [],
        slides: [],
        caption: "",
      };
      await db
        .prepare(
          "INSERT INTO studio_assets(id,thought_id,format,angle,source_hash,data,state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
        )
        .bind(
          id,
          "thought-" + post.id,
          format,
          "test",
          await sourceHash(post),
          JSON.stringify(data),
          state,
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run();
      return id;
    },
    context(body, auth = true, path = "/api/content-queue") {
      return {
        env,
        request: new Request("https://johnowolabi.com" + path, {
          method: body ? "POST" : "GET",
          headers: {
            Cookie: auth ? cookie : "",
            Origin: "https://johnowolabi.com",
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      };
    },
  };
}
test("distribution queue is private and only accepts reviewed current published writing", async (t) => {
  const s = await setup(t);
  assert.equal((await inspect(s.context(undefined, false))).status, 401);
  assert.equal((await mutate(s.context({}, false))).status, 401);
  await s.asset("draft", "tweet", "draft");
  await s.asset("private", "tweet", "approved", s.posts[1]);
  await s.asset();
  for (const [assetId, revision, channel] of [
    ["draft", 1, "x"],
    ["private", 1, "x"],
    ["asset", 2, "x"],
    ["asset", 1, "instagram"],
  ])
    assert.equal(
      (
        await mutate(
          s.context({ action: "enqueue", assetId, revision, channel }),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await mutate(
        s.context({
          action: "enqueue",
          assetId: "asset",
          revision: 1,
          channel: "x",
        }),
      )
    ).status,
    200,
  );
});
test("queueing the same reviewed version is idempotent and stays held without social connections", async (t) => {
  const s = await setup(t);
  await s.asset();
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await mutate(
          s.context({
            action: "enqueue",
            assetId: "asset",
            revision: 1,
            channel: "x",
          }),
        )
      ).status,
      200,
    );
  const { items } = await (await inspect(s.context())).json();
  assert.equal(items.length, 1);
  assert.equal(items[0].dispatchable, false);
  assert.equal(items[0].hold, "Awaiting account connection");
  assert.equal(items[0].idempotencyKey, "john:asset:1:x");
});
test("source and adaptation edits invalidate a queued review and export retains its pinned snapshot", async (t) => {
  const s = await setup(t);
  await s.asset();
  await mutate(
    s.context({
      action: "enqueue",
      assetId: "asset",
      revision: 1,
      channel: "x",
    }),
  );
  const original = await s.db
    .prepare("SELECT data FROM studio_assets WHERE id=?")
    .bind("asset")
    .first();
  await s.db
    .prepare(
      "INSERT INTO studio_versions(asset_id,revision,data,created_at) VALUES (?,1,?,?)",
    )
    .bind("asset", original.data, new Date().toISOString())
    .run();
  await s.db
    .prepare("UPDATE studio_assets SET revision=2,data=? WHERE id=?")
    .bind(
      JSON.stringify({ title: "Changed", text: "New unsent wording" }),
      "asset",
    )
    .run();
  let items = (await (await inspect(s.context())).json()).items;
  assert.match(items[0].hold, /Changed since review/);
  let exported = await inspect(
    s.context(undefined, true, "/api/content-queue?download=1"),
  );
  assert.match(exported.headers.get("Content-Disposition"), /attachment/);
  assert.equal(
    (await exported.json()).items[0].data.text,
    "One honest observation.",
  );
  s.posts[0].content = "<p>A new observation.</p>";
  items = (await (await inspect(s.context())).json()).items;
  assert.equal(items[0].dispatchable, false);
  assert.match(items[0].hold, /Changed since review/);
});
test("review queue supports pause and removal, and video briefs require recordings", async (t) => {
  const s = await setup(t);
  await s.asset("video", "video");
  const { id } = await (
    await mutate(
      s.context({
        action: "enqueue",
        assetId: "video",
        revision: 1,
        channel: "instagram",
      }),
    )
  ).json();
  let items = (await (await inspect(s.context())).json()).items;
  assert.equal(items[0].hold, "Needs recording and account connection");
  await mutate(s.context({ action: "pause", id }));
  assert.equal(
    (await (await inspect(s.context())).json()).items[0].hold,
    "Paused",
  );
  await mutate(s.context({ action: "resume", id }));
  await mutate(s.context({ action: "remove", id }));
  assert.equal(
    (await (await inspect(s.context())).json()).items[0].state,
    "cancelled",
  );
});
