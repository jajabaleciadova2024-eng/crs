import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify, resolveBellNotices, leaveReviewerIds } from "@/lib/bellNotify";

// Resubmits a rejected (non-final) leave request by resetting it to pending.
// The member's own request only — uses the admin client because the RLS policy
// only allows updates on pending rows.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: leaveRequest } = await supabase
    .from("leave_requests")
    .select("id, associate_id, status, final_rejection")
    .eq("id", id)
    .single();

  if (!leaveRequest) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (leaveRequest.associate_id !== user.id) {
    return NextResponse.json({ error: "You can only resubmit your own request." }, { status: 403 });
  }
  if (leaveRequest.status !== "rejected") {
    return NextResponse.json({ error: "Only rejected requests can be resubmitted." }, { status: 400 });
  }
  if (leaveRequest.final_rejection) {
    return NextResponse.json({ error: "This request was finally rejected and cannot be resubmitted." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("leave_requests")
    .update({
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      seen_by_associate: false,
      final_rejection: false,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await resolveBellNotices("leave_reviewed", id);
  await bellNotify(await leaveReviewerIds(), user.id, "leave_submitted", null, id);

  return NextResponse.json({ ok: true });
}
