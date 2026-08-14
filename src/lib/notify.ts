import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { toTitleCase, formatFullName } from "@/lib/format";

// Notification triggers, called server-side after the relevant DB write.
// Each one uses the service-role client to look up target emails/prefs
// (RLS on notification_prefs only allows reading your own row, which is why
// these can't run through the normal request-scoped client).
//
// Every lookup here logs its `error` field instead of only checking `!data`
// — a query that fails (permissions, transient DB issue, etc.) used to
// silently no-op with zero trace, indistinguishable from "nothing to send".
// sendEmail()'s own result is also logged here so a misconfigured/missing
// provider (no SMTP_* or RESEND_API_KEY set — see src/lib/email.ts) shows
// up clearly in server logs instead of vanishing after a bare console.warn
// three calls deep.

export async function notifyLeaveStatusChange(leaveRequestId: string) {
  const admin = createAdminClient();

  const { data: leave, error: leaveError } = await admin
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, status, associate_id, review_note")
    .eq("id", leaveRequestId)
    .single();
  if (leaveError || !leave) {
    console.error("[notify] notifyLeaveStatusChange: couldn't load leave request", leaveRequestId, leaveError);
    return;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email, first_name")
    .eq("id", leave.associate_id)
    .single();
  if (profileError || !profile) {
    console.error("[notify] notifyLeaveStatusChange: couldn't load profile", leave.associate_id, profileError);
    return;
  }

  const { data: prefs, error: prefsError } = await admin
    .from("notification_prefs")
    .select("on_own_leave_status_change")
    .eq("profile_id", leave.associate_id)
    .maybeSingle();
  if (prefsError) {
    console.error("[notify] notifyLeaveStatusChange: couldn't load prefs", leave.associate_id, prefsError);
    return;
  }
  if (prefs && prefs.on_own_leave_status_change === false) return;

  const result = await sendEmail(
    profile.email,
    `Your ${leave.leave_type} leave request was ${leave.status}`,
    `<p>Hi ${toTitleCase(profile.first_name)},</p>
     <p>Your leave request (${leave.leave_type}, ${leave.start_date} to ${leave.end_date}) was
     <strong>${leave.status}</strong>.</p>
     ${leave.status === "rejected" && leave.review_note ? `<p><strong>Reason:</strong> ${leave.review_note}</p>` : ""}`
  );
  if (!result.sent) console.error("[notify] notifyLeaveStatusChange: send failed", result.reason, "to", profile.email);
}

// Only Team Leaders can actually approve/reject (see 0005_restrict_oic_write_access.sql),
// so only they get notified about new requests needing review — OIC still
// sees all leave requests in the app, just can't act on them.
export async function notifyApproversNewLeave(leaveRequestId: string) {
  const admin = createAdminClient();

  const { data: leave, error: leaveError } = await admin
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, associate_id")
    .eq("id", leaveRequestId)
    .single();
  if (leaveError || !leave) {
    console.error("[notify] notifyApproversNewLeave: couldn't load leave request", leaveRequestId, leaveError);
    return;
  }

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", leave.associate_id)
    .single();
  if (requesterError) console.error("[notify] notifyApproversNewLeave: couldn't load requester", leave.associate_id, requesterError);

  const { data: approvers, error: approversError } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "team_leader")
    .eq("is_active", true);
  if (approversError) {
    console.error("[notify] notifyApproversNewLeave: couldn't load approvers", approversError);
    return;
  }
  if (!approvers || approvers.length === 0) return;

  const { data: prefsRows, error: prefsError } = await admin
    .from("notification_prefs")
    .select("profile_id, on_new_leave_to_review")
    .in(
      "profile_id",
      approvers.map((a) => a.id)
    );
  if (prefsError) {
    console.error("[notify] notifyApproversNewLeave: couldn't load prefs", prefsError);
    return;
  }
  const prefsById = new Map((prefsRows ?? []).map((p) => [p.profile_id, p]));

  const recipients = approvers
    .filter((a) => prefsById.get(a.id)?.on_new_leave_to_review !== false)
    .map((a) => a.email);
  if (recipients.length === 0) return;

  const result = await sendEmail(
    recipients,
    `New leave request from ${requester?.first_name ? toTitleCase(requester.first_name) : "an associate"}`,
    `<p>${formatFullName(requester?.first_name, requester?.last_name)} filed a
     ${leave.leave_type} leave request (${leave.start_date} to ${leave.end_date})
     awaiting your review.</p>`
  );
  if (!result.sent) console.error("[notify] notifyApproversNewLeave: send failed", result.reason, "to", recipients);
}

export async function notifyLeadersNewAccessRequest(accessRequestId: string) {
  const admin = createAdminClient();

  const { data: req, error: reqError } = await admin
    .from("access_requests")
    .select("first_name, last_name, email")
    .eq("id", accessRequestId)
    .single();
  if (reqError || !req) {
    console.error("[notify] notifyLeadersNewAccessRequest: couldn't load access request", accessRequestId, reqError);
    return;
  }

  // Access requests are a Team Leader decision specifically (approving one
  // creates a new account), unlike leave requests which OIC can also act on.
  const { data: leaders, error: leadersError } = await admin
    .from("profiles")
    .select("email")
    .eq("role", "team_leader")
    .eq("is_active", true);
  if (leadersError) {
    console.error("[notify] notifyLeadersNewAccessRequest: couldn't load leaders", leadersError);
    return;
  }
  if (!leaders || leaders.length === 0) return;

  const result = await sendEmail(
    leaders.map((l) => l.email),
    `New access request from ${formatFullName(req.first_name, req.last_name)}`,
    `<p>${formatFullName(req.first_name, req.last_name)} (${req.email}) requested access to CRS Naga.</p>
     <p>Review it from the app's Access Requests page.</p>`
  );
  if (!result.sent) console.error("[notify] notifyLeadersNewAccessRequest: send failed", result.reason);
}

export async function notifySchedulePublished(weekStartDate: string) {
  const admin = createAdminClient();

  const { data: active, error: activeError } = await admin.from("profiles").select("id, email").eq("is_active", true);
  if (activeError) {
    console.error("[notify] notifySchedulePublished: couldn't load active profiles", activeError);
    return;
  }
  if (!active || active.length === 0) return;

  const { data: prefsRows, error: prefsError } = await admin
    .from("notification_prefs")
    .select("profile_id, on_schedule_published")
    .in(
      "profile_id",
      active.map((a) => a.id)
    );
  if (prefsError) {
    console.error("[notify] notifySchedulePublished: couldn't load prefs", prefsError);
    return;
  }
  const prefsById = new Map((prefsRows ?? []).map((p) => [p.profile_id, p]));

  const recipients = active
    .filter((a) => prefsById.get(a.id)?.on_schedule_published !== false)
    .map((a) => a.email);
  if (recipients.length === 0) return;

  const result = await sendEmail(
    recipients,
    `Weekly schedule published — week of ${weekStartDate}`,
    `<p>The station schedule for the week of <strong>${weekStartDate}</strong> has been
     published. Check the Schedule page for your assignment.</p>`
  );
  if (!result.sent) console.error("[notify] notifySchedulePublished: send failed", result.reason, "to", recipients);
}
