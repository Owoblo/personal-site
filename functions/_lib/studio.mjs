import { tokenHash } from "./newsletter-store.mjs";
export const thoughtId = (post) => post.thoughtId || `thought-${post.id}`;
export const defaultVoice = {
  principles:
    "Reflective, curious, candid. Keep my Nigerian and Canadian perspective without inventing experiences. Preserve uncertainty and contradictions. Use natural sentences, specific observations, and a quiet literary tone.",
  avoid:
    "No invented facts, quotes, statistics, success claims, or personal stories. No hype, engagement bait, fake urgency, generic motivational lessons, or automatic hashtag piles.",
  examples: [],
  corrections: "",
  cta: "Read the full thought and subscribe at johnowolabi.com.",
};
export const formats = [
  "carousel",
  "tweet",
  "thread",
  "linkedin",
  "facebook",
  "video",
];
export const channels = [
  "instagram",
  "x",
  "linkedin",
  "facebook",
  "tiktok",
  "email",
  "direct",
];
export const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
export function plainText(html) {
  return String(html || "")
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
export async function sourceHash(post) {
  return tokenHash(JSON.stringify([post.title, post.content]));
}
export async function syncThoughts(db, posts) {
  if (!db) return;
  const now = new Date().toISOString();
  const updates = await Promise.all(
    posts.map(async (p) =>
      db
        .prepare(
          "INSERT INTO studio_thoughts(id,post_id,slug,title,source_hash,visible,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,source_hash=excluded.source_hash,visible=excluded.visible,updated_at=excluded.updated_at",
        )
        .bind(
          thoughtId(p),
          p.id,
          p.slug,
          p.title,
          await sourceHash(p),
          (p.status || "published") === "published" ? 1 : 0,
          now,
        ),
    ),
  );
  for (let i = 0; i < updates.length; i += 40)
    await db.batch(updates.slice(i, i + 40));
}
export async function voiceProfile(db) {
  const row = await db
    .prepare("SELECT * FROM studio_settings WHERE id='voice'")
    .first();
  return row
    ? { ...JSON.parse(row.data), revision: row.revision }
    : { ...defaultVoice, revision: 0 };
}
export async function createLink(
  db,
  { thought, assetId = null, channel = "direct", target },
) {
  if (!channels.includes(channel)) throw Error("Choose a valid channel.");
  const url = new URL(target);
  if (url.origin !== "https://johnowolabi.com")
    throw Error("Links must point to this website.");
  const asset = assetId
    ? await db
        .prepare(
          "SELECT revision FROM studio_assets WHERE id=? AND thought_id=?",
        )
        .bind(assetId, thought)
        .first()
    : null;
  if (assetId && !asset)
    throw Error("This adaptation belongs to a different thought.");
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO studio_links(id,thought_id,asset_id,channel,target,created_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(id, thought, assetId, channel, url.href, new Date().toISOString())
    .run();
  if (asset)
    await db
      .prepare(
        "INSERT INTO studio_link_versions(link_id,revision) VALUES (?,?)",
      )
      .bind(id, asset.revision)
      .run();
  return { id, url: `https://johnowolabi.com/r/${id}` };
}
export function cleanAsset(data) {
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.title !== "string" ||
    data.title.length > 300 ||
    typeof data.text !== "string" ||
    data.text.length > 30000 ||
    typeof data.caption !== "string" ||
    data.caption.length > 6000 ||
    !Array.isArray(data.slides) ||
    data.slides.length > 30 ||
    !Array.isArray(data.parts) ||
    data.parts.length > 30 ||
    data.parts.some((p) => typeof p !== "string" || p.length > 6000) ||
    data.slides.some(
      (s) =>
        typeof s.heading !== "string" ||
        s.heading.length > 300 ||
        typeof s.body !== "string" ||
        s.body.length > 5000,
    )
  )
    throw Error("This draft contains invalid or oversized text.");
  const photo = data.photo || "";
  if (
    photo.length > 400000 ||
    (photo &&
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) &&
      ![
        "https://johnowolabi.com/p.jpeg",
        "https://johnowolabi.com/11.png",
      ].includes(photo))
  )
    throw Error("Choose a smaller photo.");
  return {
    title: data.title,
    text: data.text,
    caption: data.caption,
    slides: data.slides.map((s) => ({ heading: s.heading, body: s.body })),
    parts: data.parts,
    template: data.template === "photo" ? "photo" : "journal",
    theme: ["light", "dark", "mixed"].includes(data.theme) ? data.theme : "light",
    photo,
  };
}
export function starterAsset(post) {
  const paragraphs = plainText(post.content).split(/\n\n+/).filter(Boolean);
  const slides = [
    { heading: post.title, body: "" },
    ...paragraphs.slice(0, 5).map((body) => ({ heading: "", body })),
    {
      heading: "A thought worth sitting with.",
      body: "Read the full piece and subscribe at johnowolabi.com.",
    },
  ];
  return {
    title: post.title,
    text: paragraphs.join("\n\n"),
    caption: post.title + "\n\nRead more at johnowolabi.com.",
    parts: paragraphs.slice(0, 8),
    slides,
    template: "journal",
    theme: "light",
    photo: "",
  };
}
