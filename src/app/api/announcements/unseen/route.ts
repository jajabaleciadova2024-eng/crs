import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — returns the latest unseen announcement for the first-visit modal.
// Only returns one (the newest unseen) to avoid stacking modals.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // Get IDs of announcements this user has already seen
  const { data: seenRows } = await supabase
    .from("announcement_seen")
    .select("announcement_id")
    .eq("profile_id", user.id);

  const seenIds = (seenRows ?? []).map((r) => r.announcement_id);

  // Fetch the latest announcement the user hasn't seen
  let query = admin
    .from("announcements")
    .select("id, title, body, created_at, profiles!announcements_author_id_fkey(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(1);

  if (seenIds.length > 0) {
    // Supabase PostgREST: not.in needs parenthesized, comma-separated list
    query = query.not("id", "in", `(${seenIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[announcements] unseen GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { announcement: data?.[0] ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
