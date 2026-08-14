import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH — edit own post
// DELETE — delete own post (or any post if Team Leader)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Post can't be empty." }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "Post can't exceed 2000 characters." }, { status: 400 });

  // RLS enforces author_id = auth.uid() on update
  const { error } = await supabase.from("posts").update({ content }).eq("id", id);
  if (error) {
    console.error("[feed] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Team Leader only — post authors can no longer self-delete. Explicit
  // check (not just left to RLS) so a non-TL caller gets a clear 403
  // rather than a silent no-op delete.
  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can delete posts." }, { status: 403 });
  }

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) {
    console.error("[feed] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
