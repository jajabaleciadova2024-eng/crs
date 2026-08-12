import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadLeaveDocument } from "@/lib/googleDrive";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Lets the requester upload supporting documentation (medical certificate,
// bereavement proof, etc.) for their OWN leave request, any time after
// filing. Goes through the admin client for the DB update since ownership
// is already verified explicitly here — simpler than adding a broader
// "owner can always update" RLS policy that would also reopen approved/
// rejected rows to self-editing (see leave_requests_update_own_pending,
// which is intentionally pending-only).
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
    .select("id, associate_id")
    .eq("id", id)
    .single();

  if (!leaveRequest || leaveRequest.associate_id !== user.id) {
    return NextResponse.json({ error: "You can only upload a document to your own request." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (10MB max)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadLeaveDocument(`${id}-${file.name}`, file.type || "application/octet-stream", buffer);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from("leave_requests")
    .update({ document_url: result.url, document_uploaded_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, url: result.url });
}
