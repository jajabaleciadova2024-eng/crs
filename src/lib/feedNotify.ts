import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Feed notifications — the bell icon in the top nav. Server-side only;
// notifications table has RLS that lets recipients read/mark-read their
// own rows but no insert policy, so all writes MUST go through the admin
// client. No emails involved — this is purely in-app.
//
// Actors never notify themselves (self-reacts/self-comments are silently
// skipped). Comment mentions notify EVERY mentioned first name once, but
// only when a matching active member exists — cosmetic mentions like
// "@nobody" don't create notifications.

export async function notifyPostReaction(postId: string, actorId: string, reaction: string) {
  const admin = createAdminClient();

  const { data: post } = await admin.from("posts").select("author_id").eq("id", postId).single();
  if (!post) return;
  if (post.author_id === actorId) return; // don't notify yourself

  // Upsert-like: one reaction notification per (post, actor). If the actor
  // switches from 👍 to ❤️, we update the existing row rather than stacking
  // "Alice liked ..." + "Alice hearted ..." in the bell.
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("recipient_id", post.author_id)
    .eq("actor_id", actorId)
    .eq("post_id", postId)
    .eq("type", "post_reaction")
    .maybeSingle();

  if (existing) {
    await admin.from("notifications").update({ reaction, read: false, created_at: new Date().toISOString() }).eq("id", existing.id);
    return;
  }

  const { error } = await admin.from("notifications").insert({
    recipient_id: post.author_id,
    actor_id: actorId,
    type: "post_reaction",
    post_id: postId,
    reaction,
  });
  if (error) console.error("[feedNotify] notifyPostReaction:", error);
}

export async function clearReactionNotification(postId: string, actorId: string) {
  const admin = createAdminClient();
  await admin
    .from("notifications")
    .delete()
    .eq("actor_id", actorId)
    .eq("post_id", postId)
    .eq("type", "post_reaction");
}

export async function notifyPostComment(postId: string, commentId: string, actorId: string) {
  const admin = createAdminClient();

  const { data: comment } = await admin.from("post_comments").select("content").eq("id", commentId).single();
  const { data: post } = await admin.from("posts").select("author_id").eq("id", postId).single();
  if (!post) return;

  // Notify the post author (unless they wrote the comment themselves)
  if (post.author_id !== actorId) {
    const { error } = await admin.from("notifications").insert({
      recipient_id: post.author_id,
      actor_id: actorId,
      type: "post_comment",
      post_id: postId,
      comment_id: commentId,
    });
    if (error) console.error("[feedNotify] notifyPostComment (author):", error);
  }

  // Notify any @mentioned first names in the comment body — de-dup vs the
  // post author (they already got notified above) and vs the actor.
  if (comment?.content) {
    const mentionMatches: string[] = [];
    for (const m of comment.content.matchAll(/@([A-Za-z][A-Za-z'-]*)/g)) {
      mentionMatches.push(m[1].toLowerCase());
    }
    if (mentionMatches.length > 0) {
      const { data: matched } = await admin
        .from("profiles")
        .select("id, first_name")
        .eq("is_active", true);
      const uniqueTargets = new Set<string>();
      for (const p of matched ?? []) {
        if (mentionMatches.includes(p.first_name.toLowerCase())) uniqueTargets.add(p.id);
      }
      uniqueTargets.delete(actorId);
      if (post.author_id !== actorId) uniqueTargets.delete(post.author_id); // already notified as post author
      for (const recipient_id of uniqueTargets) {
        const { error } = await admin.from("notifications").insert({
          recipient_id,
          actor_id: actorId,
          type: "comment_mention",
          post_id: postId,
          comment_id: commentId,
        });
        if (error) console.error("[feedNotify] notifyPostComment (mention):", error);
      }
    }
  }
}
