import { requireProfile, isApprover, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentQueueWeekStart } from "@/lib/scheduleDates";
import { Panel, PageHeader, Button } from "@/components/ui";
import LeaveRequestForm from "./LeaveRequestForm";
import LeaveQueueTable from "./LeaveQueueTable";
import { DEFAULT_LEAVE_TYPE_CONFIGS } from "@/lib/leaveTypes";
import { countBlockingTasks } from "@/lib/taskBlockingServer";
import { credentialBlock } from "@/lib/passwordBlockingServer";
import { resolveBellNotices } from "@/lib/bellNotify";

export default async function LeavePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // canViewAll: sees everyone's requests, not just their own (Team Leader + OIC).
  // canManage: can approve/reject (Team Leader only).
  // canFile: can file a leave request for themselves — associates and OIC,
  // same as each other; the Team Leader approves/rejects instead of filing
  // through this form. (canViewAll used to gate the filing form too, which
  // incorrectly hid it from OIC along with Team Leader — OIC isn't a
  // decision-maker here, just a broader viewer, so they should file the
  // same as any associate.)
  const canViewAll = isApprover(profile.role);
  const canManage = canManageOperations(profile.role);
  const canFile = profile.role !== "team_leader";
  // Filing is gated on tasks the same way the Weekly Schedule is: an
  // assigned task with no APPROVED completion blocks new leave requests
  // until the Team Leader clears it. The Team Leader never files here, so
  // they are never gated. The API enforces this too — hiding the form is
  // only the visible half (see /api/leave POST).
  const blockingTaskCount = canFile ? await countBlockingTasks(profile.id, "leave") : 0;
  // An expiring password locks filing the same way an outstanding task does.
  const credential = canFile ? await credentialBlock(profile.id) : { blocking: false, lastResetAt: null };
  const fileLocked = blockingTaskCount > 0 || credential.blocking;

  // The Queue mirrors History in every way except its time window: pending
  // requests always show here, but decided (approved/rejected) ones only
  // stay in the Queue through the current week -- they roll over into
  // History once Monday 8am (Manila) has passed. This keeps the Queue from
  // filling up with old decided requests while still giving everyone a few
  // days to see how a recent request was decided.
  //
  // Exception: a rejected pre-approved-type request (Sick/Bereavement) that
  // now has a document attached stays in the Queue regardless of week --
  // the associate can still upload after rejection, and once they do, the
  // Team Leader needs it back in view to re-review/approve, not buried in
  // History (document_path is only ever set for that behavior type, so
  // this can't accidentally surface other rejected requests). A FINAL
  // rejection (final_rejection = true) ends that cycle -- it rolls into
  // History on the normal week-based schedule like anything else, even
  // with a document attached.
  const weekStart = currentQueueWeekStart();
  const listQuery = supabase
    .from("leave_requests")
    // leave_requests has two FKs to profiles (associate_id, reviewed_by) —
    // must name which one, otherwise PostgREST errors with "more than one
    // relationship was found" and the whole query returns null (this was
    // silently emptying the queue for every account).
    .select("*, profiles!leave_requests_associate_id_fkey(first_name, last_name, avatar_url), leave_request_ranges(start_date, end_date)")
    // Approved requests leave the Queue the moment they're approved — the
    // decision is made, so it belongs in History, not in the review list.
    // Rejections still linger through the current week so the associate
    // sees the outcome (and, for pre-approved types, can upload a document
    // and get it re-reviewed).
    .or(`status.eq.pending,and(status.eq.rejected,reviewed_at.gte.${weekStart}),and(status.eq.rejected,document_path.not.is.null,final_rejection.eq.false)`)
    // status first (leave_status is an enum declared pending/approved/
    // rejected, so pending — the rows that still need action — sorts to the
    // top), then by the leave date itself: soonest on top, furthest down,
    // so whatever is about to happen is what the Team Leader sees first.
    // created_at only breaks ties between two requests for the same day.
    .order("status", { ascending: true })
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: false });

  const [{ data: orgSettings }, { data: requests }] = await Promise.all([
    supabase.from("org_settings").select("*").limit(1).maybeSingle(),
    canViewAll ? listQuery : listQuery.eq("associate_id", profile.id),
  ]);
  const leaveTypeConfigs = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;

  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  // Viewing this page acknowledges any of the viewer's own requests that
  // have since been decided, clearing their sidebar badge -- unconditional
  // (not scoped to what's currently in the Queue window) since a decided
  // request can age out of the Queue into History before the owner checks.
  // Run via the admin client since RLS only lets an owner update their OWN
  // request while it's still pending, not after it's been decided.
  const admin = createAdminClient();
  // Opening this page IS seeing the decision. The same stroke that clears
  // the sidebar badge clears the bell notice behind it, or the two disagree
  // the moment you look at the page.
  const { data: nowSeen } = await admin
    .from("leave_requests")
    .update({ seen_by_associate: true })
    .eq("associate_id", profile.id)
    .eq("seen_by_associate", false)
    .select("id");
  for (const row of nowSeen ?? []) {
    await resolveBellNotices("leave_reviewed", (row as { id: string }).id);
  }

  return (
    <>
      <PageHeader
        title="Leave Requests"
        subtitle={
          canFile && canViewAll
            ? "File your own request, and track requests from the whole team"
            : canFile
              ? "File a request and track your leave history"
              : "Track requests from your team"
        }
        action={
          <div className="flex items-center gap-2">
            <Button href="/leave/calendar">View calendar →</Button>
            <Button href="/leave/history">View history →</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1">
        {canFile && fileLocked && (
          <Panel title="File a request">
            <div className="flex flex-col items-start gap-2 py-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink)]">
                <span>🔒</span>
                <span>
                  {credential.blocking
                    ? "Filing is locked — your password needs resetting"
                    : `Filing is locked — ${blockingTaskCount} task${blockingTaskCount !== 1 ? "s" : ""} pending`}
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--muted)] m-0 leading-snug">
                {credential.blocking
                  ? "Reset your password on the platform and report it on Account Security, then wait for the Team Leader to confirm it."
                  : `Complete your assigned task${blockingTaskCount !== 1 ? "s" : ""} and wait for the Team Leader to approve them.`}{" "}
                Requests you have already filed are unaffected and still show in the Queue below.
              </p>
              <Button href={credential.blocking ? "/account" : "/tasks"}>
                {credential.blocking ? "Go to Account Security →" : "Go to my tasks →"}
              </Button>
            </div>
          </Panel>
        )}
        {canFile && !fileLocked && (
          <Panel title="File a request">
            <LeaveRequestForm leaveTypeConfigs={leaveTypeConfigs} requireReason={orgSettings?.require_leave_reason ?? true} />
          </Panel>
        )}

        <Panel title="Queue" hint={`${pendingCount} pending`}>
          <div className="overflow-x-auto scroll-shadow-x">
            <LeaveQueueTable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              requests={(requests ?? []) as any}
              leaveTypeConfigs={leaveTypeConfigs}
              requireReason={orgSettings?.require_leave_reason ?? true}
              viewerId={profile.id}
              canViewAll={canViewAll}
              canManage={canManage}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
