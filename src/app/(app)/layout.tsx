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
        .select("id, deadline, blocker_days_before, assign_to")
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
    pendingTaskCount = (myTasks ?? []).filter(
      (t: { id: string; deadline: string | null; blocker_days_before: number }) =>
        !approvedIds.has(t.id) && isTaskBlockingToday(t),
    ).length;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <SidebarShell>
        <Sidebar
          profile={profile}
          pendingAccessRequests={pendingAccessRequests}
          pendingLeaveRequests={pendingLeaveRequests}
          pendingTaskCount={pendingTaskCount}
          realRole={realRole}
        />
      </SidebarShell>
      <main
        className="flex-1 min-w-0 px-3 sm:px-4 md:px-10 py-5 md:py-8 pb-16 w-full md:ml-[var(--sidebar-width,220px)] transition-[margin-left] duration-200 ease-out"
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
