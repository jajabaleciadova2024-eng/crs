import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH — edit announcement (TL only, enforced by RLS)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const title = (body.title ?? "").trim();
  const announcementBody = (body.body ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!announcementBody) return NextResponse.json({ error: "Description is required." }, { status: 400 });

  const { error } = await supabase.from("announcements").update({ title, body: announcementBody }).eq("id", id);
  if (error) {
    console.error("[announcements] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — TL only
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) {
    console.error("[announcements] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
