import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// In-app notification-bell inserts. Distinct from src/lib/notify.ts, which
// sends EMAIL notifications — this writes rows into `notifications`, the
// table NotificationBell reads. Fire-and-forget: a failed insert must never
// fail the action that triggered it.

export type BellType =
  | "task_submitted"
  | "task_reviewed"
  | "task_assigned"
  | "leave_submitted"
  | "leave_reviewed"
  | "schedule_published"
  | "post_new"
  | "task_poke"
  | "password_reset_submitted"
  | "password_reset_reviewed"
  | "password_expiring"
  | "schedule_changed"
  | "leave_updated"
  | "credential_proof_submitted";

export async function bellNotify(
  recipientIds: string[],
  actorId: string,
  type: BellType,
  // Set for post-scoped types so the bell can deep-link to the post.
  postId: string | null = null,
  // WHICH thing this is about — a completion, a leave request, a reset.
  // Without it a notice can never be told apart from another of the same
  // type by the same person, so nothing can mark it done when the work is
  // done, and the bell keeps counting finished work forever.
  refId: string | null = null,
): Promise<void> {
  // Don't notify someone about their own action.
  const targets = [...new Set(recipientIds)].filter((id) => id && id !== actorId);
  if (targets.length === 0) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").insert(
      targets.map((recipient_id) => ({
        recipient_id,
        actor_id: actorId,
        type,
        post_id: postId,
        ref_id: refId,
        comment_id: null,
        reaction: null,
        read: false,
      })),
    );
    if (error) console.error(`[bellNotify] insert ${type} failed:`, error);
  } catch (err) {
    console.error(`[bellNotify] threw for ${type}:`, err);
  }
}

/**
 * Mark every unread notice about one thing as read.
 *
 * Called at the moment the work is finished — a submission reviewed, a leave
 * request decided, a proof verified. The alternative, leaving them for the
 * recipient to click, is what let the bell and the sidebar badge disagree:
 * the badge is a live count of outstanding work and drops immediately, while
 * an unread notice sits there forever describing something already handled.
 *
 * Scoped by (type, ref_id) so approving one member's submission does not
 * clear the notice about their other one.
 */
export async function resolveBellNotices(type: BellType, refId: string): Promise<void> {
  if (!refId) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("notifications")
      .update({ read: true })
      .eq("type", type)
      .eq("ref_id", refId)
      .eq("read", false);
    if (error) console.error(`[resolveBellNotices] ${type} failed:`, error);
  } catch (err) {
    console.error(`[resolveBellNotices] threw for ${type}:`, err);
  }
}

// All active members (any role) — for org-wide events like a published schedule.
export async function allActiveMemberIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("is_active", true);
  return (data ?? []).map((p: { id: string }) => p.id);
}

/**
 * Who to tell that a leave request needs a decision.
 *
 * Team Leaders only. An OIC can SEE every request but cannot approve or
 * reject one, so a notice about a queue they cannot clear is a number that
 * never goes down — and the Leave Requests badge, being Team-Leader-only,
 * never showed it either. The bell and the badge disagreed permanently for
 * that role. Notifying whoever can act fixes both ends at once.
 *
 * This is about the review queue, not visibility: an OIC still opens Leave
 * Requests and sees everything, and still gets notified about their own
 * filed requests like anybody else.
 */
export async function leaveReviewerIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .eq("role", "team_leader");
  return (data ?? []).map((p: { id: string }) => p.id);
}
