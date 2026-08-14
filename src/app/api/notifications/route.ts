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

  const unread = (data ?? []).filter((n: { read: boolean }) => !n.read).length;
  return NextResponse.json(
    { notifications: data ?? [], unread },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
