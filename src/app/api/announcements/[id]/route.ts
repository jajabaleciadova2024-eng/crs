import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAnnouncementImages } from "@/lib/announcementImageStorage";

// PATCH — edit announcement (TL only, enforced by RLS)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can change an announcement." }, { status: 403 });
  }


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

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can change an announcement." }, { status: 403 });
  }


  // Read the image paths before the row goes: nothing else records them,
  // so deleting first would leave the files orphaned in the bucket with no
  // way left to find them.
  const { data: doomed } = await admin
    .from("announcements")
    .select("image_paths")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (!error) await deleteAnnouncementImages((doomed?.image_paths as string[] | null) ?? []);
  if (error) {
    console.error("[announcements] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
