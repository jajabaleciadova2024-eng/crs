import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ANNOUNCEMENT_SHOWINGS } from "@/lib/announcementShowings";

// POST — record that the member was shown this announcement's modal.
//
// The count advances once per LOGIN, not once per dismissal: last_sign_in_at
// is stable for the life of a session, so a member who refreshes the page
// after dismissing does not spend a second showing. Once the count reaches
// ANNOUNCEMENT_SHOWINGS the announcement stops popping up for good.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const announcementId = body.announcement_id;
  if (!announcementId) return NextResponse.json({ error: "Missing announcement_id." }, { status: 400 });

  const currentLogin = user.last_sign_in_at ?? null;

  const { data: existing } = await supabase
    .from("announcement_seen")
    .select("id, view_count, last_shown_login")
    .eq("announcement_id", announcementId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    // Same login as the last counted showing — the member reopened the page,
    // they were not shown it again on a fresh login. Nothing to record.
    if (currentLogin !== null && existing.last_shown_login === currentLogin) {
      return NextResponse.json({ ok: true, viewCount: existing.view_count });
    }
    const next = Math.min((existing.view_count ?? 1) + 1, ANNOUNCEMENT_SHOWINGS);
    const { error } = await supabase
      .from("announcement_seen")
      .update({ view_count: next, last_shown_login: currentLogin, seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      console.error("[announcements] seen update error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, viewCount: next });
  }

  const { error } = await supabase.from("announcement_seen").insert({
    announcement_id: announcementId,
    profile_id: user.id,
    view_count: 1,
    last_shown_login: currentLogin,
  });

  if (error) {
    console.error("[announcements] seen POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, viewCount: 1 });
}
