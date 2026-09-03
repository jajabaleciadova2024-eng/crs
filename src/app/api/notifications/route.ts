import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — the signed-in user's notifications (most-recent first, with actor
// profile joined). Admin client (see /api/feed/GET for the reasoning).
export async function GET(_request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("*, profiles!notifications_actor_id_fkey(first_name, last_name, avatar_url)")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[notifications] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reconcile "submitted a task for approval" against what is actually in
  // the tasks table.
  //
  // A notification is a fire-and-forget row: once written it stays written,
  // even after the thing it announced is gone. A member who submits and then
  // withdraws — or whose task gets deleted — leaves the Team Leader holding
  // a notice for work that does not exist, with no way to tell that from a
  // submission the page is failing to show. That is not a cosmetic problem:
  // it makes the bell untrustworthy exactly where it is meant to be a queue.
  //
  // So every task_submitted notice is checked against its actor's
  // completions before it is handed over. It stays as-is while that member
  // still has a row (pending = still yours to review; approved/declined =
  // true history of something you already actioned). With no row at all,
  // there is nothing behind it, and it is relabelled rather than silently
  // dropped so the Team Leader can see what happened.
  const rows = (data ?? []) as { type: string; actor_id: string | null; read: boolean }[];
  const submitterIds = [
    ...new Set(
      rows
        .filter((n) => n.type === "task_submitted" && n.actor_id)
        .map((n) => n.actor_id as string),
    ),
  ];

  let withdrawnBy = new Set<string>();
  if (submitterIds.length > 0) {
    const { data: live } = await admin
      .from("member_task_completions")
      .select("profile_id")
      .in("profile_id", submitterIds);
    const stillHasWork = new Set((live ?? []).map((c: { profile_id: string }) => c.profile_id));
    withdrawnBy = new Set(submitterIds.filter((id) => !stillHasWork.has(id)));
  }

  const notifications = rows.map((n) =>
    n.type === "task_submitted" && n.actor_id && withdrawnBy.has(n.actor_id)
      ? { ...n, stale: true }
      : n,
  );

  // A notice with nothing behind it is not work waiting on you, so it does
  // not inflate the badge either.
  const unread = notifications.filter(
    (n: { read: boolean; stale?: boolean }) => !n.read && !n.stale,
  ).length;
  return NextResponse.json(
    { notifications, unread },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
