import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // Get the caller's role
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const isTL = profile.role === "team_leader";
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // "open" | "closed" | null (all)

  let query = admin
    .from("tickets")
    .select("*, ticket_attachments(id, file_path, file_name, file_type, file_size, created_at)")
    .order("created_at", { ascending: false });

  if (!isTL) {
    // Non-TL: only see own tickets
    query = query.eq("reporter_id", user.id);
  }

  if (status === "open" || status === "closed") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[tickets] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strip reporter_id for TL — keep anonymity
  const tickets = (data ?? []).map((t) => {
    const isOwn = t.reporter_id === user.id;
    return {
      ...t,
      reporter_id: isOwn ? t.reporter_id : undefined,
      is_own: isOwn,
    };
  });

  return NextResponse.json(
    { tickets },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const subject = (body.subject ?? "").trim();
  const description = (body.description ?? "").trim();
  const attachments: { file_path: string; file_name: string; file_type: string; file_size: number }[] =
    body.attachments ?? [];

  if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Description is required." }, { status: 400 });
  if (subject.length > 200) return NextResponse.json({ error: "Subject must be under 200 characters." }, { status: 400 });
  if (description.length > 10000) return NextResponse.json({ error: "Description must be under 10,000 characters." }, { status: 400 });

  // Insert ticket
  const { data: inserted, error } = await supabase
    .from("tickets")
    .insert({ reporter_id: user.id, subject, description })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[tickets] POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't submit ticket." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Insert attachments if any
  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      ticket_id: inserted.id,
      file_path: a.file_path,
      file_name: a.file_name,
      file_type: a.file_type,
      file_size: a.file_size,
    }));
    const { error: attError } = await admin.from("ticket_attachments").insert(rows);
    if (attError) console.error("[tickets] attachment insert error:", attError);
  }

  // Notify TL(s) via bell
  const { data: leaders } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "team_leader")
    .eq("is_active", true);

  if (leaders && leaders.length > 0) {
    const notifications = leaders.map((tl) => ({
      recipient_id: tl.id,
      actor_id: user.id,
      type: "ticket_new" as const,
      post_id: null,
      comment_id: null,
    }));
    const { error: notifError } = await admin.from("notifications").insert(notifications);
    if (notifError) console.error("[tickets] notification insert error:", notifError);
  }

  // Fetch full ticket with attachments
  const { data: ticket } = await admin
    .from("tickets")
    .select("*, ticket_attachments(id, file_path, file_name, file_type, file_size, created_at)")
    .eq("id", inserted.id)
    .single();

  return NextResponse.json({
    ticket: ticket ? { ...ticket, is_own: true } : inserted,
  });
}
