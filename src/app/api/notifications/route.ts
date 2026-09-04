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

  // Reconcile "submitted a task for approval" against what is actually there.
  //
  // Reviewing a submission now marks its notice read at the moment of the
  // decision, so the ordinary case needs nothing here. This covers the one
  // it cannot: a member who WITHDRAWS. The completion row is deleted, so
  // there is no review to hang a resolution on, and the Team Leader is left
  // holding a notice for work that no longer exists — which is exactly how
  // the bell and the sidebar badge drifted apart.
  //
  // ref_id names the completion, so this is a single lookup: any notice
  // whose completion has gone is stale. Rows from before ref_id existed
  // have none and are left alone rather than guessed at.
  const rows = (data ?? []) as {
    type: string;
    ref_id: string | null;
    read: boolean;
  }[];
  const completionIds = [
    ...new Set(
      rows.filter((n) => n.type === "task_submitted" && n.ref_id).map((n) => n.ref_id as string),
    ),
  ];

  let goneIds = new Set<string>();
  if (completionIds.length > 0) {
    const { data: live } = await admin
      .from("member_task_completions")
      .select("id")
      .in("id", completionIds);
    const alive = new Set((live ?? []).map((c: { id: string }) => c.id));
    goneIds = new Set(completionIds.filter((id) => !alive.has(id)));
  }

  const notifications = rows.map((n) =>
    n.type === "task_submitted" && n.ref_id && goneIds.has(n.ref_id) ? { ...n, stale: true } : n,
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
