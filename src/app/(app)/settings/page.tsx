import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/ui";
import AccountForm from "./AccountForm";
import NotificationPrefsForm from "./NotificationPrefsForm";
import OrgSettingsForm from "./OrgSettingsForm";

export default async function SettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const approver = isApprover(profile.role);
  const isTeamLeader = profile.role === "team_leader";

  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const { data: orgSettings } = isTeamLeader
    ? await supabase.from("org_settings").select("*").limit(1).maybeSingle()
    : { data: null };

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Settings</h1>
        <p className="text-sm text-[var(--muted)] m-0">
          {isTeamLeader ? "Manage your account, notifications, and organization-wide settings" : "Manage your account and preferences"}
        </p>
      </header>

      <Panel title="My account">
        <AccountForm profile={profile} />
      </Panel>

      <Panel title="Notifications">
        <NotificationPrefsForm prefs={prefs} profileId={profile.id} showReviewToggle={approver} />
      </Panel>

      {isTeamLeader && orgSettings && (
        <Panel title="Organization settings" hint="Team Leader only" footnote="Changes here apply to the whole team, not just your account.">
          <OrgSettingsForm settings={orgSettings} />
        </Panel>
      )}
    </>
  );
}
