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

// All active members (any role) — for org-wide events like a published schedule.
export async function allActiveMemberIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("is_active", true);
  return (data ?? []).map((p: { id: string }) => p.id);
}

// Everyone a task can be assigned to — active, minus Team Leaders, who set
// the tasks rather than carry them out.
export async function taskAssignableMemberIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .neq("role", "team_leader");
  return (data ?? []).map((p: { id: string }) => p.id);
}

// Everyone who can review leave (team_leader + oic).
export async function approverIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .in("role", ["team_leader", "oic"]);
  return (data ?? []).map((p: { id: string }) => p.id);
}
