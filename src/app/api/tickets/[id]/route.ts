import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — single ticket with attachments and messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const { data: ticket, error } = await admin
    .from("tickets")
    .select("*, ticket_attachments(id, file_path, file_name, file_type, file_size, created_at)")
    .eq("id", id)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  // Only reporter or TL can view
  const isTL = profile.role === "team_leader";
  const isOwn = ticket.reporter_id === user.id;
  if (!isTL && !isOwn) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Fetch messages
  const { data: messages } = await admin
    .from("ticket_messages")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  // Anonymize sender info for TL — mark which messages are from reporter
  const processedMessages = (messages ?? []).map((m) => ({
    ...m,
    is_reporter: m.sender_id === ticket.reporter_id,
    is_own: m.sender_id === user.id,
    // Strip sender_id for TL when it's the reporter's message
    sender_id: isTL && m.sender_id === ticket.reporter_id ? undefined : m.sender_id,
  }));

  return NextResponse.json(
    {
      ticket: {
        ...ticket,
        reporter_id: isOwn ? ticket.reporter_id : undefined,
        is_own: isOwn,
      },
      messages: processedMessages,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

// PATCH — close or reopen a ticket (TL only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can manage tickets." }, { status: 403 });
  }

  const body = await request.json();
  const status = body.status;
  if (status !== "open" && status !== "closed") {
    return NextResponse.json({ error: "Status must be 'open' or 'closed'." }, { status: 400 });
  }

  const update: Record<string, unknown> = { status };
  if (status === "closed") update.closed_at = new Date().toISOString();
  else update.closed_at = null;

  const { error } = await admin.from("tickets").update(update).eq("id", id);
  if (error) {
    console.error("[tickets] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
