import { thoughtId, sourceHash } from "./studio.mjs";
export const publishingChannels = [
  "instagram",
  "facebook",
  "x",
  "linkedin",
  "tiktok",
];
const allowed = {
  carousel: ["instagram", "facebook", "linkedin", "tiktok"],
  tweet: ["x"],
  thread: ["x"],
  linkedin: ["linkedin"],
  facebook: ["facebook"],
  video: ["instagram", "facebook", "tiktok", "x", "linkedin"],
};
export function channelFits(format, channel) {
  return Boolean(allowed[format]?.includes(channel));
}
export async function inspectContentQueue(env, posts) {
  const { results } = await env.NEWSLETTER_DB.prepare(
    "SELECT q.*,a.format,a.state AS asset_state,a.revision AS current_revision,a.source_hash AS current_source_hash,a.thought_id,json_extract(a.data,'$.title') AS title FROM studio_content_queue q LEFT JOIN studio_assets a ON a.id=q.asset_id ORDER BY q.created_at DESC LIMIT 250",
  ).all();
  const hashes = new Map(
      await Promise.all(
        posts.map(async (p) => [thoughtId(p), await sourceHash(p)]),
      ),
    ),
    byThought = new Map(posts.map((p) => [thoughtId(p), p]));
  return results.map((item) => {
    const post = byThought.get(item.thought_id);
    let hold;
    if (item.state === "paused") hold = "Paused";
    else if (item.state === "cancelled") hold = "Removed from queue";
    else if (item.state === "published") hold = "Published";
    else if (!post || (post.status || "published") !== "published")
      hold = "Source thought is private or unavailable";
    else if (
      item.asset_revision !== item.current_revision ||
      item.source_hash !== hashes.get(item.thought_id) ||
      item.current_source_hash !== hashes.get(item.thought_id)
    )
      hold = "Changed since review — approve the current version again";
    else if (item.asset_state !== "approved") hold = "Needs review";
    else if (!channelFits(item.format, item.channel))
      hold = "Choose a supported destination";
    else if (item.not_before && Date.parse(item.not_before) > Date.now())
      hold = "Planned for later";
    else if (item.format === "video")
      hold = "Needs recording and account connection";
    else hold = "Awaiting account connection";
    return {
      ...item,
      hold,
      dispatchable: false,
      idempotencyKey: `john:${item.asset_id}:${item.asset_revision}:${item.channel}`,
    };
  });
}
