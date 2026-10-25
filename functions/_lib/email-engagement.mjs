import { createLink, thoughtId } from "./studio.mjs";
export async function deliveryLinks(db, campaign, contactId, post) {
  let row = await db
    .prepare(
      "SELECT e.*,l.target FROM newsletter_engagement e JOIN studio_links l ON l.id=e.link_id WHERE e.campaign_id=? AND e.contact_id=?",
    )
    .bind(campaign.id, contactId)
    .first();
  if (!row) {
    const link = await createLink(db, {
      thought: thoughtId(post),
      channel: "email",
      target: `https://johnowolabi.com/post/${post.slug}/`,
    });
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT OR IGNORE INTO newsletter_engagement(id,campaign_id,contact_id,thought_id,link_id) VALUES (?,?,?,?,?)",
      )
      .bind(id, campaign.id, contactId, thoughtId(post), link.id)
      .run();
    row = await db
      .prepare(
        "SELECT * FROM newsletter_engagement WHERE campaign_id=? AND contact_id=?",
      )
      .bind(campaign.id, contactId)
      .first();
  }
  return {
    articleUrl: `https://johnowolabi.com/r/${row.link_id}`,
    pixelUrl: `https://johnowolabi.com/email-open/${row.id}.gif`,
  };
}
