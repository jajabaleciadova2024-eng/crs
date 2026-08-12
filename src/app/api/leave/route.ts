import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyApproversNewLeave } from "@/lib/notify";

// Files a leave request as the signed-in associate (insert respects the
// existing "leave_requests_insert_own" RLS policy — no admin client here),
// then notifies Team Leader/OIC approvers who have the pref enabled.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json();
  const { leave_type, start_date, end_date, reason } = body ?? {};

  if (!leave_type || !start_date || !end_date) {
    return NextResponse.json({ error: "Leave type, start date, and end date are required." }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("leave_requests")
    .insert({
      associate_id: user.id,
      leave_type,
      start_date,
      end_date,
      reason: reason || null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Couldn't submit your request." }, { status: 400 });
  }

  await notifyApproversNewLeave(inserted.id);

  return NextResponse.json({ ok: true });
}
