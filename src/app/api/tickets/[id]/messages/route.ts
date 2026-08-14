import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — send a message in a ticket thread
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ticketId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // Verify ticket exists and caller has access
  const { data: ticket } = await admin.from("tickets").select("id, reporter_id, status").eq("id", ticketId).single();
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const isTL = profile.role === "team_leader";
  const isReporter = ticket.reporter_id === user.id;
  if (!isTL && !isReporter) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (ticket.status === "closed") {
    return NextResponse.json({ error: "This ticket is closed. Reopen it to send messages." }, { status: 400 });
  }

  const body = await request.json();
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  if (content.length > 5000) return NextResponse.json({ error: "Message must be under 5,000 characters." }, { status: 400 });

  const { data: message, error } = await admin
    .from("ticket_messages")
    .insert({ ticket_id: ticketId, sender_id: user.id, content })
    .select("*")
    .single();

  if (error || !message) {
    console.error("[tickets] message POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't send message." }, { status: 400 });
  }

  // Notify the other party via bell
  if (isTL) {
    // TL replied → notify the anonymous reporter
    const { error: notifError } = await admin.from("notifications").insert({
      recipient_id: ticket.reporter_id,
      actor_id: user.id,
      type: "ticket_reply" as const,
      post_id: null,
      comment_id: null,
    });
    if (notifError) console.error("[tickets] notification error:", notifError);
  } else {
    // Reporter messaged → notify all TLs
    const { data: leaders } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "team_leader")
      .eq("is_active", true);
    if (leaders && leaders.length > 0) {
      const notifications = leaders.map((tl) => ({
        recipient_id: tl.id,
        actor_id: user.id,
        type: "ticket_reply" as const,
        post_id: null,
        comment_id: null,
      }));
      const { error: notifError } = await admin.from("notifications").insert(notifications);
      if (notifError) console.error("[tickets] notification error:", notifError);
    }
  }

  return NextResponse.json({
    message: {
      ...message,
      is_reporter: isReporter,
      is_own: true,
    },
  });
}
