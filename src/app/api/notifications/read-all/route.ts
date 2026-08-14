import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Marks every unread notification for the signed-in user as read. RLS
// (notifications_update_own) already scopes updates to recipient_id =
// auth.uid(), so a plain update is safe here.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
