import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import AnnouncementsFeed from "@/components/announcements/AnnouncementsFeed";

export default async function AnnouncementsPage() {
  const profile = await requireProfile();

  const admin = createAdminClient();
  const { data: mentionable } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("is_active", true)
    .order("first_name");

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Official announcements from the Team Leader"
      />
      <AnnouncementsFeed
        userId={profile.id}
        currentUserRole={profile.role}
        mentionable={mentionable ?? []}
      />
    </>
  );
}
