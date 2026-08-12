import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasVacationConflict } from "@/lib/leaveConflict";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";

// Lets the filing form show a live "this date may conflict" warning before
// submitting — read-only, doesn't create anything.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { leave_type, ranges, excludeRequestId } = await request.json();
  if (!leave_type || !Array.isArray(ranges) || ranges.length === 0) {
    return NextResponse.json({ conflict: false });
  }

  const admin = createAdminClient();
  const { data: orgSettings } = await admin.from("org_settings").select("leave_type_configs").limit(1).maybeSingle();
  const configs: LeaveTypeConfig[] = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;

  const typeConfig = configs.find((c) => c.key === leave_type);
  if (!typeConfig || typeConfig.behavior !== "vacation_conflict") {
    return NextResponse.json({ conflict: false });
  }

  const vacationKeys = configs.filter((c) => c.behavior === "vacation_conflict").map((c) => c.key);
  const conflict = await hasVacationConflict(vacationKeys, ranges, excludeRequestId || undefined);

  return NextResponse.json({ conflict });
}
