import { requireProfile, isApprover } from "@/lib/auth";
import { Panel } from "@/components/ui";

type Role = "team_leader" | "oic" | "associate";
type GuideItem = { q: string; a: string; roles?: Role[] }; // omit roles = everyone

type GuideSection = {
  title: string;
  hint?: string;
  roles?: Role[]; // omit = everyone
  items: GuideItem[];
};

const SECTIONS: GuideSection[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "How do I log in?",
        a: "Use the PSID or email your Team Leader gave you, plus the password you set from the invite email. First-time users: check your inbox (and spam folder) for an invite link from Supabase after your Team Leader adds you.",
      },
      {
        q: "I forgot my password — what do I do?",
        a: "On the login page, click \"Forgot password?\", enter your PSID or email, and a reset link will be emailed to you. Already signed in? You can also reset it from Settings → My account → \"Send password reset link\".",
      },
      {
        q: "What's on the Dashboard?",
        a: "A quick snapshot: how many stations are manned this week, how many leave requests are pending, who's currently immune from shuffling, your role, this week's full station assignment grid, and your 5 most recent leave requests.",
      },
      {
        q: "I don't have an account yet — how do I get one?",
        a: "On the login page, click \"Request access\" and fill in your name, email, and (optionally) mobile number and a note. Your Team Leader reviews it in the app; once approved, you'll get the same invite email as anyone added directly.",
      },
    ],
  },
  {
    title: "Weekly Schedule",
    items: [
      {
        q: "How do I see my station assignment?",
        a: "Go to Weekly Schedule. Your row is highlighted if you're assigned. If nothing shows, no schedule has been generated for the current week yet.",
      },
      {
        q: "How does the weekly rotation work?",
        a: "Each week, associates are assigned one station each. Anyone flagged \"Immune\" keeps their previous station and isn't shuffled — everyone else gets reshuffled across the remaining open stations.",
      },
      {
        q: "How do I generate the next week's schedule?",
        a: "Click \"Generate next week\" on the Weekly Schedule page. It fills in the current week if it's empty, or creates the next one after whatever's already scheduled. You can still manually reassign any station afterward.",
        roles: ["team_leader", "oic"],
      },
      {
        q: "How do I manually reassign a station?",
        a: "On the Weekly Schedule page, use the dropdown next to any row to swap who's assigned to that station.",
        roles: ["team_leader", "oic"],
      },
    ],
  },
  {
    title: "Leave requests",
    items: [
      {
        q: "How do I file a leave request?",
        a: "Go to Leave Requests, fill in the type, dates, and a reason (if required by your org's settings), then submit. You'll see it appear in your queue as \"Pending.\"",
        roles: ["associate"],
      },
      {
        q: "How do I approve or reject a request?",
        a: "On the Leave Requests page, use the Approve/Reject buttons next to any pending request that isn't your own. You can't approve/reject your own leave.",
        roles: ["team_leader", "oic"],
      },
      {
        q: "Will I be notified when something changes?",
        a: "Yes, if you've left the relevant toggle on in Settings → Notifications: associates get emailed when their request's status changes; Team Leaders/OICs get emailed when a new request needs review.",
      },
    ],
  },
  {
    title: "Team & roles",
    roles: ["team_leader"],
    items: [
      {
        q: "How do I add a new team member?",
        a: "Go to Team & Roles → \"Add member.\" They'll get an invite email to set their own password — they can then log in with their PSID or email.",
      },
      {
        q: "How do I change someone's role or the immune flag?",
        a: "On Team & Roles, click Edit next to their row, adjust Role and/or Immune, then Save.",
      },
      {
        q: "How do I deactivate someone instead of deleting them?",
        a: "Use the Deactivate button on their row. Deactivated members are excluded from active-associate queries (like scheduling) but their history is preserved.",
      },
      {
        q: "How do I handle a \"Request access\" submission?",
        a: "Go to Access Requests (badge in the sidebar shows how many are waiting). Click Approve, fill in a PSID and role, then Confirm — this sends them the same invite email as adding a member manually. Reject just dismisses it, no email sent.",
      },
      {
        q: "A new member says their invite link is \"invalid or expired\" even though they just got the email — what happened?",
        a: "Invite links are one-time-use. On some corporate email domains, the company's mail security (e.g. Microsoft Safe Links) auto-clicks links in incoming email to scan them before the person ever opens their inbox — that uses up the link. Their account is usually already created at that point, so just have them use \"Forgot password?\" on the login page to set their own password instead of re-sending the invite.",
      },
    ],
  },
  {
    title: "Workstations",
    roles: ["team_leader", "oic"],
    items: [
      {
        q: "How do I add or edit a station?",
        a: "Go to Workstations. You can add new stations or edit/deactivate existing ones. Deactivated stations are skipped by the auto-shuffle.",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        q: "Where do I manage my notification preferences?",
        a: "Settings → Notifications. Toggle emails for leave status changes, schedule publishing, and (if you're an approver) new requests to review.",
      },
      {
        q: "What's \"Associate groups\"?",
        a: "A label (Tenured or New Hire) you can set per associate, managed manually — there's no automatic promotion by tenure date. It doesn't affect scheduling yet, but is meant to feed a future auto-shuffle rule.",
        roles: ["team_leader"],
      },
      {
        q: "What's in Organization settings?",
        a: "Leave types offered, schedule cadence (weekly/bi-weekly), and whether a reason is required on leave requests — applies to the whole team.",
        roles: ["team_leader"],
      },
    ],
  },
];

export default async function GuidePage() {
  const profile = await requireProfile();
  const approver = isApprover(profile.role);

  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(profile.role)),
  })).filter((section) => (!section.roles || section.roles.includes(profile.role)) && section.items.length > 0);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">User Guide</h1>
        <p className="text-sm text-[var(--muted)] m-0">
          How to use CRS Naga — tailored to what {approver ? "you can manage" : "you can do"} as {profile.first_name}
          &apos;s role.
        </p>
      </header>

      {visibleSections.map((section) => (
        <Panel key={section.title} title={section.title}>
          <dl className="flex flex-col gap-3.5">
            {section.items.map((item) => (
              <div key={item.q}>
                <dt className="text-[13px] font-bold mb-1">{item.q}</dt>
                <dd className="text-[13px] text-[var(--muted)] m-0 leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ))}
    </>
  );
}
