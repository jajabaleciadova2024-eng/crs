import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST — mark an announcement as seen (so the modal won't show again)
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const announcementId = body.announcement_id;
  if (!announcementId) return NextResponse.json({ error: "Missing announcement_id." }, { status: 400 });

  const { error } = await supabase
    .from("announcement_seen")
    .upsert({ announcement_id: announcementId, profile_id: user.id }, { onConflict: "announcement_id,profile_id" });

  if (error) {
    console.error("[announcements] seen POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
