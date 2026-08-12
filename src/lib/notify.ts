import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

// Notification triggers, called server-side after the relevant DB write.
// Each one uses the service-role client to look up target emails/prefs
// (RLS on notification_prefs only allows reading your own row, which is why
// these can't run through the normal request-scoped client).

export async function notifyLeaveStatusChange(leaveRequestId: string) {
  const admin = createAdminClient();

  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, status, associate_id")
    .eq("id", leaveRequestId)
    .single();
  if (!leave) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("email, first_name")
    .eq("id", leave.associate_id)
    .single();
  if (!profile) return;

  const { data: prefs } = await admin
    .from("notification_prefs")
    .select("on_own_leave_status_change")
    .eq("profile_id", leave.associate_id)
    .maybeSingle();
  if (prefs && prefs.on_own_leave_status_change === false) return;

  await sendEmail(
    profile.email,
    `Your ${leave.leave_type} leave request was ${leave.status}`,
    `<p>Hi ${profile.first_name},</p>
     <p>Your leave request (${leave.leave_type}, ${leave.start_date} to ${leave.end_date}) was
     <strong>${leave.status}</strong>.</p>`
  );
}

export async function notifyApproversNewLeave(leaveRequestId: string) {
  const admin = createAdminClient();

  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, associate_id")
    .eq("id", leaveRequestId)
    .single();
  if (!leave) return;

  const { data: requester } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", leave.associate_id)
    .single();

  const { data: approvers } = await admin
    .from("profiles")
    .select("id, email")
    .in("role", ["team_leader", "oic"])
    .eq("is_active", true);
  if (!approvers || approvers.length === 0) return;

  const { data: prefsRows } = await admin
    .from("notification_prefs")
    .select("profile_id, on_new_leave_to_review")
    .in(
      "profile_id",
      approvers.map((a) => a.id)
    );
  const prefsById = new Map((prefsRows ?? []).map((p) => [p.profile_id, p]));

  const recipients = approvers
    .filter((a) => prefsById.get(a.id)?.on_new_leave_to_review !== false)
    .map((a) => a.email);
  if (recipients.length === 0) return;

  await sendEmail(
    recipients,
    `New leave request from ${requester?.first_name ?? "an associate"}`,
    `<p>${requester?.first_name ?? ""} ${requester?.last_name ?? ""} filed a
     ${leave.leave_type} leave request (${leave.start_date} to ${leave.end_date})
     awaiting your review.</p>`
  );
}

export async function notifyLeadersNewAccessRequest(accessRequestId: string) {
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("access_requests")
    .select("first_name, last_name, email")
    .eq("id", accessRequestId)
    .single();
  if (!req) return;

  // Access requests are a Team Leader decision specifically (approving one
  // creates a new account), unlike leave requests which OIC can also act on.
  const { data: leaders } = await admin.from("profiles").select("email").eq("role", "team_leader").eq("is_active", true);
  if (!leaders || leaders.length === 0) return;

  await sendEmail(
    leaders.map((l) => l.email),
    `New access request from ${req.first_name} ${req.last_name}`,
    `<p>${req.first_name} ${req.last_name} (${req.email}) requested access to CRS Naga.</p>
     <p>Review it from the app's Access Requests page.</p>`
  );
}

export async function notifySchedulePublished(weekStartDate: string) {
  const admin = createAdminClient();

  const { data: active } = await admin.from("profiles").select("id, email").eq("is_active", true);
  if (!active || active.length === 0) return;

  const { data: prefsRows } = await admin
    .from("notification_prefs")
    .select("profile_id, on_schedule_published")
    .in(
      "profile_id",
      active.map((a) => a.id)
    );
  const prefsById = new Map((prefsRows ?? []).map((p) => [p.profile_id, p]));

  const recipients = active
    .filter((a) => prefsById.get(a.id)?.on_schedule_published !== false)
    .map((a) => a.email);
  if (recipients.length === 0) return;

  await sendEmail(
    recipients,
    `Weekly schedule published — week of ${weekStartDate}`,
    `<p>The station schedule for the week of <strong>${weekStartDate}</strong> has been
     published. Check the Schedule page for your assignment.</p>`
  );
}
