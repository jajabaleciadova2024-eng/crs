import { requireProfileWithPreview, ROLE_LABEL, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import SidebarShell from "@/components/SidebarShell";
import PreviewBanner from "@/components/PreviewBanner";

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

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <SidebarShell>
        <Sidebar
          profile={profile}
          pendingAccessRequests={pendingAccessRequests}
          pendingLeaveRequests={pendingLeaveRequests}
          realRole={realRole}
        />
      </SidebarShell>
      <main
        className="flex-1 min-w-0 px-4 md:px-10 py-5 md:py-8 pb-16 max-w-[1000px] w-full md:ml-[var(--sidebar-width,220px)] transition-[margin-left] duration-200 ease-out"
      >
        {previewing && <PreviewBanner label={ROLE_LABEL[profile.role]} />}
        {children}
      </main>
    </div>
  );
}
