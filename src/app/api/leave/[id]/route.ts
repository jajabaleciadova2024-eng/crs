import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyLeaveStatusChange } from "@/lib/notify";

// Approves/rejects a leave request as the signed-in Team Leader/OIC (update
// respects the existing "leave_requests_update_leadership_not_self" RLS
// policy — no admin client here), then notifies the requesting associate.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json();
  const { status } = body ?? {};
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyLeaveStatusChange(id);

  return NextResponse.json({ ok: true });
}
