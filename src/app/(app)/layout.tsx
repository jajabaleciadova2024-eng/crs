import { requireProfileWithPreview, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import PreviewBanner from "@/components/PreviewBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, realRole, previewing } = await requireProfileWithPreview();

  let pendingAccessRequests = 0;
  if (profile.role === "team_leader") {
    const supabase = await createClient();
    const { count } = await supabase
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingAccessRequests = count ?? 0;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} pendingAccessRequests={pendingAccessRequests} realRole={realRole} />
      <main className="flex-1 px-8 py-7 pb-16 max-w-[980px]">
        {previewing && <PreviewBanner label={ROLE_LABEL[profile.role]} />}
        {children}
      </main>
    </div>
  );
}
