import { requireProfile, canManageOperations } from "@/lib/auth";
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
        a: "A quick snapshot: how many stations are manned this week, how many leave requests are pending, your role, this week's full station assignment grid, and your 5 most recent leave requests. Team Leaders also see how many associates are currently immune from shuffling.",
      },
      {
        q: "I don't have an account yet — how do I get one?",
        a: "On the login page, click \"Request access\" and fill in your name, email, and (optionally) mobile number and a note. This creates an Associate account once approved. Team Leader/OIC accounts are set up directly by the Team Leader from Team & Roles, not through this form.",
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
        a: "Each week (Monday–Friday, Philippine time) associates are assigned one station each. Anyone flagged \"Immune\" keeps their previous station and isn't shuffled — everyone else gets reshuffled across the remaining open stations. Philippine regular holidays falling in the week are flagged at the top of the page.",
      },
      {
        q: "How do I generate the next week's schedule?",
        a: "Click \"Generate next week\" on the Weekly Schedule page — this opens a planning screen listing every station. If anyone is currently flagged Immune, place each of them at a station first — Generate stays disabled until every immune member has one (no more automatic carryover from last week). Then set each station's headcount and how many should be Tenured vs. New Hire; the totals at the bottom subtract live as you type. OIC is included and eligible to be seated. Click Generate to create it. It fills in the current week if it's empty, or creates the next one after whatever's already scheduled. You can still manually reassign any station afterward. Team Leader only — OIC can view the schedule but not generate or reassign.",
        roles: ["team_leader"],
      },
      {
        q: "What does the \"Leave\" column mean?",
        a: "Flags anyone assigned this week who also has approved leave overlapping these dates — a heads-up, not automatic. Reassign their station manually if needed.",
        roles: ["team_leader"],
      },
      {
        q: "How do I manually reassign a station?",
        a: "On the Weekly Schedule page, use the dropdown next to any row to swap who's assigned to that station. Team Leader only.",
        roles: ["team_leader"],
      },
      {
        q: "How do I clear a generated schedule and start over?",
        a: "Click \"Clear schedule\" next to \"Generate next week\" — you'll get a warning before it deletes every assignment for that week. This can't be undone. Team Leader only.",
        roles: ["team_leader"],
      },
    ],
  },
  {
    title: "Leave requests",
    items: [
      {
        q: "How do I file a leave request?",
        a: "Go to Leave Requests, pick a type, fill in a reason (if required), and add date(s). If your days off aren't consecutive, click \"+ Add another date range\" instead of filing separately. Submit — it appears in your queue as \"Pending.\"",
        roles: ["associate"],
      },
      {
        q: "How do I edit or cancel a request I filed?",
        a: "While it's still Pending, use the Edit or Cancel button on your row in the queue. Once it's approved or rejected, it's locked — file a new one instead.",
      },
      {
        q: "How do I approve or reject a request?",
        a: "On the Leave Requests page, use the Approve/Reject buttons next to any pending request that isn't your own. You can't approve/reject your own leave. Team Leader only — OIC sees everyone's requests but can't act on them.",
        roles: ["team_leader"],
      },
      {
        q: "Where can I see a history of approved leave?",
        a: "Click \"View history\" at the top of Leave Requests. It's grouped into semi-monthly periods (1st–15th and 16th–end of month), most recent first. Team Leader only.",
        roles: ["team_leader"],
      },
      {
        q: "How do I view or download an associate's supporting document?",
        a: "On the Leave Requests queue, the Document column shows View/Download buttons for any Sick/Bereavement-type request that has one uploaded. Team Leader only. These are freshly-generated links each time you click, and documents get auto-deleted after a while — download a copy if you need to keep it longer.",
        roles: ["team_leader"],
      },
      {
        q: "What does \"Possible conflict\" mean?",
        a: "For Vacation-type leave, only one person can be on leave per day org-wide. If your requested dates overlap someone else's pending/approved Vacation leave, you'll see a warning before submitting — you can still submit, but it's more likely to be rejected on review.",
      },
      {
        q: "Do Sick/Bereavement requests need approval?",
        a: "Yes. They're flagged \"Pre-approved\" and can be filed before you have the document in hand, but the Team Leader's Approve button stays disabled until you've uploaded a supporting document (medical certificate, proof of the event, etc.) from the Document column on your row — approve without one just isn't possible. Documents are private — only you and the Team Leader can view or download them, and they're auto-deleted after a while to keep storage tidy (ask your Team Leader if you need it back after that).",
      },
      {
        q: "Will I be notified when something changes?",
        a: "Yes, if you've left the relevant toggle on in Settings → Notifications: associates get emailed when their request's status changes; the Team Leader gets emailed when a new request needs review.",
      },
    ],
  },
  {
    title: "Team & roles",
    roles: ["team_leader"],
    items: [
      {
        q: "How do I add a new team member?",
        a: "Go to Team & Roles → \"Add member.\" They'll get an invite email to set their own password — they can then log in with their PSID or email. The roster lists everyone (Team Leader, OIC, and associates), sorted by PSID from lowest to highest.",
      },
      {
        q: "How do I change someone's role?",
        a: "On Team & Roles, click Edit next to their row, adjust Role, then Save.",
      },
      {
        q: "How do I deactivate someone instead of deleting them?",
        a: "Use the Deactivate button on their row. Deactivated members are excluded from active-associate queries (like scheduling) but their history is preserved.",
      },
      {
        q: "Where do I set someone's Immune flag or Tenure (associates)?",
        a: "Weekly Schedule → Rotation Settings (Team Leader only), not Team & Roles — those two only matter for schedule generation, so they live next to the Generate button that actually uses them. Click Edit on a row, adjust Immune and/or Tenure, then Save. Immune excludes someone from the weekly shuffle (they must be placed manually when generating); Tenure (associates only) feeds the Tenured/New Hire quotas in the Generate modal.",
      },
      {
        q: "How do I handle a \"Request access\" submission?",
        a: "Go to Access Requests (badge in the sidebar shows how many are waiting). Click Approve, assign a PSID, then Confirm — this always creates an Associate account and sends the same invite email as adding a member manually. To promote someone to OIC or Team Leader, do it from Team & Roles after their account exists. Reject just dismisses it, no email sent.",
      },
      {
        q: "A new member says their invite link is \"invalid or expired\" even though they just got the email — what happened?",
        a: "Invite links are one-time-use. On some corporate email domains, the company's mail security (e.g. Microsoft Safe Links) auto-clicks links in incoming email to scan them before the person ever opens their inbox — that uses up the link. Their account is usually already created at that point, so just have them use \"Forgot password?\" on the login page to set their own password instead of re-sending the invite.",
      },
    ],
  },
  {
    title: "Workstations",
    roles: ["team_leader"],
    items: [
      {
        q: "How do I add or edit a station?",
        a: "Go to Workstations. You can add new stations or edit/deactivate existing ones. Deactivated stations are skipped by the auto-shuffle. Team Leader only.",
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
        q: "What's in Organization settings?",
        a: "Schedule cadence (weekly/bi-weekly), whether a reason is required on leave requests, and the leave types themselves — applies to the whole team.",
        roles: ["team_leader"],
      },
      {
        q: "How do I add or change a leave type?",
        a: "Settings → Organization settings → Leave types. Add a type, rename any of them, or change a type's \"behavior\": Standard review (default), Vacation-style (1 person/day conflict checking), or Pre-approved (can be filed without a document, but approval is held until one is uploaded). Renaming an existing type keeps its history intact — only newly-added types get a fresh key.",
        roles: ["team_leader"],
      },
      {
        q: "What's \"Preview as\" in the sidebar?",
        a: "Lets you see the entire app exactly as an OIC or Associate would — nav, page access, buttons, even this guide's content — without a second account. A banner stays visible at the top of every page while active; click \"Exit preview\" (or pick \"Team Leader (you)\") to return to normal. It's a testing aid only — your real Team Leader permissions never actually change underneath it.",
        roles: ["team_leader"],
      },
    ],
  },
];

export default async function GuidePage() {
  const profile = await requireProfile();
  const canManage = canManageOperations(profile.role);

  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(profile.role)),
  })).filter((section) => (!section.roles || section.roles.includes(profile.role)) && section.items.length > 0);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">User Guide</h1>
        <p className="text-sm text-[var(--muted)] m-0">
          How to use CRS Naga — tailored to what {canManage ? "you can manage" : "you can do"} as {profile.first_name}
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
