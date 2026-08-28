import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, canManageOperations } from "@/lib/auth";

// GET — list holidays (optional ?year=YYYY filter)
export async function GET(request: Request) {
  const supabase = await createClient();
  await requireProfile();
  const url = new URL(request.url);
  const year = url.searchParams.get("year");

  let query = supabase.from("holidays").select("*").order("date");
  if (year) {
    query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — add a holiday { date: "YYYY-MM-DD", name: "..." }
export async function POST(request: Request) {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (!canManageOperations(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const { date, name } = body;
  if (!date || !name) {
    return NextResponse.json({ error: "date and name required" }, { status: 400 });
  }
  const { error } = await supabase.from("holidays").upsert({ date, name, created_by: profile.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear any existing assignments and break assignments on this date —
  // a holiday overrides whatever was generated. Admin client bypasses RLS.
  const admin = createAdminClient();
  // Delete breaks first (they reference assignments via window_id + date).
  await admin.from("break_assignments").delete().eq("assignment_date", date);
  await admin.from("assignments").delete().eq("assignment_date", date);

  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/breaks");
  return NextResponse.json({ ok: true });
}

// DELETE — remove a holiday { date: "YYYY-MM-DD" }
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (!canManageOperations(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const { date } = body;
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  const { error } = await supabase.from("holidays").delete().eq("date", date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
