import type { CSSProperties } from "react";
import { requireProfileWithPreview, ROLE_LABEL, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import SidebarShell from "@/components/SidebarShell";
import PreviewBanner from "@/components/PreviewBanner";
import NotificationBell from "@/components/NotificationBell";
import UnseenAnnouncementModal from "@/components/announcements/UnseenAnnouncementModal";
import AutoLogout from "@/components/AutoLogout";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import { isPasswordBlocking } from "@/lib/passwordExpiry";
import { taskAppliesTo } from "@/lib/taskAssignment";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, realRole, previewing } = await requireProfileWithPreview();

  let pendingAccessRequests = 0;
  let pendingLeaveRequests = 0;
  const supabase = await createClient();

  // Access requests are Team-Leader-only actionable — only they get that badge.
  if (canManageOperations(profile.role)) {
    const [{ count: accessCount }, { count: leaveCount }] = await Promise.all([
      supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // Must match the Queue's own "needs action" filter (see leave/page.tsx)
      // — plain pending requests, PLUS rejected pre-approved-type requests
      // that got reopened for re-review because the associate uploaded a
      // document since being rejected. Counting only status=pending here
      // silently dropped the badge for that reopened case even though the
      // Queue shows live Approve/Reject buttons for it.
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .or("status.eq.pending,and(status.eq.rejected,document_path.not.is.null,final_rejection.eq.false)"),
    ]);
    pendingAccessRequests = accessCount ?? 0;
    pendingLeaveRequests += leaveCount ?? 0;
  }

  // Everyone (including the Team Leader, for their own filed requests) also
  // gets a badge for their own leave requests the TL just decided on, which
  // they haven't opened the Leave Requests page to see yet.
  const { count: unseenDecisions } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("associate_id", profile.id)
    .eq("seen_by_associate", false);
  pendingLeaveRequests += unseenDecisions ?? 0;

  // --- Pending task count for sidebar badge ---
  let pendingTaskCount = 0;
  const admin = createAdminClient();
  if (canManageOperations(profile.role)) {
    // TL: count completions awaiting approval
    const { count } = await admin
      .from("member_task_completions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingTaskCount = count ?? 0;
  } else {
    // Associate/OIC: count incomplete blocking tasks (without approved completion)
    const [{ data: myTasks }, { data: myCompletions }] = await Promise.all([
      admin
        .from("member_tasks")
        .select("id, deadline, blocker_days_before, assign_to, excluded_ids")
        .or(`assign_to.eq.all,assign_to.eq.${profile.id}`),
      admin
        .from("member_task_completions")
        .select("task_id, status")
        .eq("profile_id", profile.id),
    ]);
    const approvedIds = new Set(
      (myCompletions ?? [])
        .filter((c: { status: string }) => c.status === "approved")
        .map((c: { task_id: string }) => c.task_id),
    );
    // .or() matches assign_to only — the exemption list is applied here, or
    // an excused member keeps a sidebar badge for a task that is not theirs.
    pendingTaskCount = (myTasks ?? []).filter(
      (t: { id: string; deadline: string | null; blocker_days_before: number; assign_to: string; excluded_ids: string[] | null }) =>
        taskAppliesTo(t, profile.id) && !approvedIds.has(t.id) && isTaskBlockingToday(t),
    ).length;
  }

  // --- Account Security badge ---
  // TL: resets claimed and waiting on them. Member: their own account needing
  // action — inside the blocking window, expired, no baseline, or MFA still
  // missing. Both are "something you must do", which is what a badge means
  // everywhere else in this sidebar.
  let accountAlerts = 0;
  if (canManageOperations(profile.role)) {
    // Claimed resets, plus proofs uploaded and not yet checked — both are
    // work sitting on the Team Leader, and a reset cannot be confirmed while
    // its member's MFA proof is unverified.
    const [{ count: claimed }, { data: unchecked }] = await Promise.all([
      admin.from("password_resets").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin
        .from("credential_status")
        .select("mfa_proof_path, mfa_verified, mfa_review_note, passkey_proof_path, passkey_verified, passkey_review_note"),
    ]);
    const needsCheck = (unchecked ?? []).reduce((n: number, c: any) => {
      // A rejected proof is already actioned — it is the member's move now.
      if (c.mfa_proof_path && !c.mfa_verified && !c.mfa_review_note) n += 1;
      if (c.passkey_proof_path && !c.passkey_verified && !c.passkey_review_note) n += 1;
      return n;
    }, 0);
    accountAlerts = (claimed ?? 0) + needsCheck;
  } else {
    const { data: cred } = await admin
      .from("credential_status")
      .select("last_reset_at, mfa_proof_path, mfa_verified")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (isPasswordBlocking((cred?.last_reset_at as string | null) ?? null)) accountAlerts += 1;
    if (!cred?.mfa_proof_path || !cred?.mfa_verified) accountAlerts += 1;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <SidebarShell>
        <Sidebar
          profile={profile}
          pendingAccessRequests={pendingAccessRequests}
          pendingLeaveRequests={pendingLeaveRequests}
          pendingTaskCount={pendingTaskCount}
          accountAlerts={accountAlerts}
          realRole={realRole}
        />
      </SidebarShell>
      <main
        className="flex-1 min-w-0 px-3 sm:px-4 md:px-10 pt-2 md:pt-3 pb-16 w-full md:ml-[var(--sidebar-width,220px)] transition-[margin-left] duration-200 ease-out"
        // PageHeader (fixed) shifts down by this much while the preview
        // banner (also fixed, see PreviewBanner.tsx) is showing above it,
        // so the two don't overlap. Approximate — the banner can wrap to
        // two lines on narrow viewports — but good enough for a
        // Team-Leader-only testing aid, not the primary layout.
        style={{ "--preview-offset": previewing ? "40px" : "0px" } as CSSProperties}
      >
        {previewing && <PreviewBanner label={ROLE_LABEL[profile.role]} />}
        {children}
      </main>
      {/* Notification bell — fixed top-right. On mobile it sits inside the
          hamburger top bar (same z-30 band, left of the hamburger button);
          on desktop it floats above the PageHeader. */}
      <div className="fixed top-2 right-14 md:top-3 md:right-6 z-30 md:z-40">
        <NotificationBell userId={profile.id} />
      </div>
      <UnseenAnnouncementModal />
      <AutoLogout />
    </div>
  );
}
