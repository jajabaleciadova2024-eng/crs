import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, PageHeader } from "@/components/ui";
import AccountForm from "./AccountForm";
import ProfilePhotoUpload from "./ProfilePhotoUpload";
import NotificationPrefsForm from "./NotificationPrefsForm";
import OrgSettingsForm from "./OrgSettingsForm";

export default async function SettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isTeamLeader = profile.role === "team_leader";

  const [{ data: prefs }, { data: orgSettings }] = await Promise.all([
    supabase.from("notification_prefs").select("*").eq("profile_id", profile.id).maybeSingle(),
    isTeamLeader ? supabase.from("org_settings").select("*").limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={isTeamLeader ? "Manage your account, notifications, and organization-wide settings" : "Manage your account and preferences"}
      />

      <Panel title="Profile photo">
        <ProfilePhotoUpload firstName={profile.first_name} lastName={profile.last_name} avatarUrl={profile.avatar_url} />
      </Panel>

      <Panel title="My account">
        <AccountForm profile={profile} />
      </Panel>

      <Panel title="Notifications">
        {/* Only the Team Leader can approve/reject leave, so only they get
            the "new leave to review" toggle — OIC still sees all leave
            requests in the app, just can't act on them. */}
        <NotificationPrefsForm prefs={prefs} profileId={profile.id} showReviewToggle={isTeamLeader} />
      </Panel>

      {isTeamLeader && orgSettings && (
        <Panel title="Organization settings" hint="Team Leader only" footnote="Changes here apply to the whole team, not just your account.">
          <OrgSettingsForm settings={orgSettings} />
        </Panel>
      )}
    </>
  );
}
