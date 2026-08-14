import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import SocialFeed from "@/components/feed/SocialFeed";

// Dedicated Team Feed page — the dashboard only shows the 10 most recent
// posts + a "See all posts →" link into here. This one has full
// cursor-based pagination via the existing SocialFeed's Load-older button.
export default async function FeedPage() {
  const profile = await requireProfile();

  // Mentionables MUST come through the admin client — see the dashboard's
  // page.tsx for the full RLS reasoning (non-leadership members can only
  // see their own profile row through the request-scoped client).
  const admin = createAdminClient();
  const { data: mentionable } = await admin.from("profiles").select("id, first_name, last_name").eq("is_active", true).order("first_name");

  return (
    <>
      <PageHeader title="Team Feed" subtitle="Everything happening in the team, newest first" />
      <SocialFeed userId={profile.id} currentUserRole={profile.role} mentionable={mentionable ?? []} stickyComposer />
    </>
  );
}
