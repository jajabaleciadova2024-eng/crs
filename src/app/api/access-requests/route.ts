import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyLeadersNewAccessRequest } from "@/lib/notify";

// Public endpoint — the "Request access" form on /login. No auth: anyone
// can submit a request (RLS also allows anon insert as a second layer, but
// we use the admin client here so we can immediately look up the new row's
// id for the notification without an extra round trip).
export async function POST(request: Request) {
  const body = await request.json();
  const { first_name, last_name, email, mobile_number, message } = body ?? {};

  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "First name, last name, and email are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("access_requests")
    .insert({
      first_name,
      last_name,
      email,
      mobile_number: mobile_number || null,
      message: message || null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Couldn't submit your request." }, { status: 400 });
  }

  await notifyLeadersNewAccessRequest(inserted.id);

  return NextResponse.json({ ok: true });
}
