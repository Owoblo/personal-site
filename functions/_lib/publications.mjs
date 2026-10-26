export function instagramPermalink(value) {
  const url = new URL(String(value || ""));
  if (
    url.protocol !== "https:" ||
    !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/(p|reel)\/[A-Za-z0-9_-]{5,80}\/?$/.test(url.pathname)
  )
    throw Error(
      "Use the Instagram post link, such as https://www.instagram.com/p/…/.",
    );
  return `https://www.instagram.com${url.pathname.replace(/\/$/, "")}/`;
}

export async function recordPublication(db, { assetId, revision, url }) {
  const permalink = instagramPermalink(url);
  const asset = await db
    .prepare("SELECT id,revision,source_hash FROM studio_assets WHERE id=?")
    .bind(String(assetId))
    .first();
  if (!asset) throw Error("Choose a saved adaptation first.");
  if (asset.revision !== revision)
    return {
      conflict: "This adaptation changed. Reopen it before recording the post.",
    };
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO studio_publications(id,asset_id,revision,source_hash,platform,permalink,verification,recorded_at) VALUES (?,?,?,?,'instagram',?,'reported',?) ON CONFLICT(permalink) DO NOTHING",
    )
    .bind(id, asset.id, asset.revision, asset.source_hash, permalink, now)
    .run();
  const publication = await db
    .prepare("SELECT * FROM studio_publications WHERE permalink=?")
    .bind(permalink)
    .first();
  if (publication.asset_id !== asset.id)
    return {
      conflict:
        "That Instagram post is already attached to another adaptation.",
    };
  return { publication };
}
