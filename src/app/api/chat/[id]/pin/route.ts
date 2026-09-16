import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Team-Leader-only: pin (POST) or unpin (DELETE) a chat message so it stays
// visible in the pinned bar at the top of the group chat. Mirrors the DELETE
// handler's role check — the admin client bypasses RLS, so the TL gate here
// is what actually authorizes the write.
async function requireTeamLeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "team_leader") {
    return { error: NextResponse.json({ error: "Only the Team Leader can pin messages." }, { status: 403 }) };
  }
  return { user, admin };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTeamLeader();
  if (auth.error) return auth.error;

  const { error } = await auth.admin
    .from("chat_messages")
    .update({ pinned_at: new Date().toISOString(), pinned_by: auth.user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTeamLeader();
  if (auth.error) return auth.error;

  const { error } = await auth.admin
    .from("chat_messages")
    .update({ pinned_at: null, pinned_by: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
