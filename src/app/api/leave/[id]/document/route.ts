import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadLeaveDocument, getLeaveDocumentLinks } from "@/lib/documentStorage";
import { bellNotify, leaveReviewerIds } from "@/lib/bellNotify";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

async function getCallerAndRequest(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;

  const { data: leaveRequest } = await supabase
    .from("leave_requests")
    .select("id, associate_id, document_path")
    .eq("id", id)
    .single();
  if (!leaveRequest) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) } as const;

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  return { user, leaveRequest, callerRole: callerProfile?.role } as const;
}

// Uploads supporting documentation for the caller's OWN leave request, any
// time after filing.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const result = await getCallerAndRequest(supabase, id);
  if ("error" in result) return result.error;

  if (result.leaveRequest.associate_id !== result.user.id) {
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
  const path = `${id}/${Date.now()}-${file.name}`;
  const uploadResult = await uploadLeaveDocument(path, file.type || "application/octet-stream", buffer);

  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from("leave_requests")
    .update({ document_path: path, document_uploaded_at: new Date().toISOString() })
    .eq("id", id);

  // A pre-approved leave type cannot be approved without this document, so
  // its arrival is the event the approvers are actually waiting on.
  await bellNotify(await leaveReviewerIds(), result.user.id, "leave_updated", null, id);

  return NextResponse.json({ ok: true });
}

// Returns short-lived signed view/download links — owner or Team Leader
// only. Generated fresh every call rather than stored, since they expire.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const result = await getCallerAndRequest(supabase, id);
  if ("error" in result) return result.error;

  const isOwner = result.leaveRequest.associate_id === result.user.id;
  const isTeamLeader = result.callerRole === "team_leader";
  if (!isOwner && !isTeamLeader) {
    return NextResponse.json({ error: "You don't have access to this document." }, { status: 403 });
  }

  if (!result.leaveRequest.document_path) {
    return NextResponse.json({ error: "No document uploaded for this request." }, { status: 404 });
  }

  const fileName = result.leaveRequest.document_path.split("/").pop() ?? "document";
  const links = await getLeaveDocumentLinks(result.leaveRequest.document_path, fileName);
  if (!links) {
    return NextResponse.json({ error: "Couldn't generate a link right now. Try again." }, { status: 400 });
  }

  return NextResponse.json({ ...links, fileName });
}
