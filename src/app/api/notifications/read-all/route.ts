import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Marks the signed-in user's notifications read: all of them, or just one
// when the body carries an `id` (following a single notification should not
// silently clear the rest). RLS (notifications_update_own) already scopes
// updates to recipient_id = auth.uid(), so a plain update is safe here —
// the recipient_id filter below is belt-and-braces.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // A body is optional: no body, or no id in it, means "all".
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;

  let query = supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
  if (id) query = query.eq("id", id);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
