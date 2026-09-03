import { requireProfile, canManageOperations } from "@/lib/auth";
import { Panel, PageHeader } from "@/components/ui";
import { PASSWORD_VALID_DAYS, BLOCK_WITHIN_DAYS } from "@/lib/passwordExpiry";

type Role = "team_leader" | "oic" | "associate";

const ROLE_LABEL: Record<Role, string> = {
  team_leader: "Team Leader",
  oic: "OIC",
  associate: "an Associate",
};
type GuideItem = { q: string; a: string; roles?: Role[] }; // omit roles = everyone

type GuideSection = {
  title: string;
  hint?: string;
  roles?: Role[]; // omit = everyone
  items: GuideItem[];
};

const SECTIONS: GuideSection[] = [
  {
    title: "What you can access",
    hint: "Your role",
    items: [
      {
        q: "What can I do as an Associate?",
        a: "Dashboard, Weekly Schedule (view), Break Schedule, Team Feed, Announcements, Leave Requests (file your own), Members Tasks (complete yours), Leave Calendar, Concerns (anonymous), Account Security (your own row), Settings and this guide. You cannot generate or change a schedule, approve anything, or see anyone else's credential status.",
        roles: ["associate"],
      },
      {
        q: "What can I do as OIC?",
        a: "Everything an Associate can, plus two read-only oversight pages: Assignment History and Task Report. You are seated in the rotation like everyone else and your own tasks and password rules apply to you. You can see every leave request but cannot approve or reject one, and you cannot generate, clear or reassign a schedule.",
        roles: ["oic"],
      },
      {
        q: "What can I do as Team Leader?",
        a: "Everything, and you are the only one who can: generate, clear and reassign the schedule; set holidays; approve or reject leave; create tasks and approve submissions; verify MFA and passkey proof and confirm password resets; add members, change roles and handle access requests; manage workstations and organization settings; and post announcements. You also see the whole team's credential board, which nobody else can.",
        roles: ["team_leader"],
      },
      {
        q: "Where is everything?",
        a: "The sidebar is the map, and it only lists what your role can open. Badges on it are live counts of things waiting on you. On a phone, tap the menu button at the top-left to open it.",
      },
    ],
  },
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
        a: "A row of cards across the top: how long until your password expires, how many seats are filled today (anyone on approved leave is subtracted, and the card says so), your station for today and the next working day with your window and break time, and anything waiting on you. Below that: the leave calendar, the team feed, and your recent leave activity. Your name, PSID and role sit beside your photo in the header.",
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
        q: "Why can't I see tomorrow yet?",
        a: "Tomorrow's column unlocks at 12 PM Philippine time, so the Team Leader has the morning to assign the day's tasks before anyone reads ahead. A locked day shows a placeholder rather than disappearing.",
        roles: ["associate", "oic"],
      },
      {
        q: "Why are the future days locked for me?",
        a: "Either a blocking task is waiting on approval or your password is inside its blocking window. The placeholder cell says which. Today's assignment always stays visible — you are never left not knowing where to sit.",
        roles: ["associate", "oic"],
      },
      {
        q: "How does the weekly rotation work?",
        a: "Each week (Monday–Friday, Philippine time) associates are assigned one station each. Anyone flagged \"Immune\" keeps their previous station and isn't shuffled — everyone else gets reshuffled across the remaining open stations. Holidays set by the Team Leader are flagged on the schedule — no assignments are generated on holiday dates.",
      },
      {
        q: "How do I generate a week's schedule?",
        a: "Click \"Generate schedule\" on the Weekly Schedule page — this opens a planning screen listing every station, plus a Week field at the top (pre-filled with the next open week, but editable — pick any date and it snaps to that week's Monday; generating fails with a clear error if that week is already scheduled). If anyone is currently flagged Immune, place each of them at a station first — Generate stays disabled until every immune member has one (no more automatic carryover from last week). Then set each station's headcount and how many should be Tenured vs. New Hire; the totals at the bottom subtract live as you type. OIC is included and eligible to be seated. Click Generate to create it. You can still manually reassign any station afterward. Team Leader only — OIC can view the schedule but not generate or reassign.",
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
        a: "Click \"Clear schedule\" next to \"Generate schedule\" — you'll get a warning before it deletes every assignment for that week. This can't be undone. Team Leader only.",
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
    title: "Break Schedule",
    items: [
      {
        q: "How are breaks decided?",
        a: "Windows go on break, not people — whoever is seated at a window that day takes that window's slot. There are three staggered slots (10 AM, 11 AM, 12 PM) and they are worked out automatically when the week is generated, under one rule: a station is never left unmanned. A window that would leave its station empty only breaks if a reliever can cover it.",
      },
      {
        q: "Where do I see my break time?",
        a: "Break Schedule shows the full day, and your break also appears on your Dashboard Station card next to your window number (e.g. \"W21 · Break 11 AM\").",
      },
      {
        q: "My station moved — does my break move with it?",
        a: "Yes. The break belongs to the window, so when the Team Leader moves you to a different seat you take that seat's break slot, and your old one is released. Check the Break Schedule after any change rather than assuming your old time still stands.",
      },
      {
        q: "Why did the break schedule empty out on a holiday?",
        a: "Setting a holiday clears that date's assignments and breaks together — there is no coverage to plan on a day nobody is on the floor.",
      },
      {
        q: "Someone is break-immune — what does that mean?",
        a: "A break-immune member keeps whatever slot they already had instead of being reshuffled with everyone else when a new week is generated.",
      },
    ],
  },
  {
    title: "Members Tasks",
    items: [
      {
        q: "Where do I find my tasks?",
        a: "Members Tasks in the sidebar. The badge shows how many still need doing. Each task shows its description in the format the Team Leader wrote it, its deadline, and pills telling you whether it is for all members, whether it blocks your access, and whether a photo is required.",
        roles: ["associate", "oic"],
      },
      {
        q: "How do I mark a task complete?",
        a: "Tick the checkbox on the task. If the task requires a photo you will be asked to upload one, and if it asks for a completion date you pick that too. Submitting does NOT complete the task on its own — it goes to the Team Leader as \"Pending approval\" until they review it.",
        roles: ["associate", "oic"],
      },
      {
        q: "What does a \"Blocking\" task actually block?",
        a: "Until every blocking task assigned to you is APPROVED, you cannot see future dates on the Weekly Schedule (today stays visible), you cannot see tomorrow's station on your Dashboard, and you cannot file a Leave Request. Nothing else is restricted — the Team Feed, Announcements, Break Schedule, Concerns and your own Account Security stay open.",
      },
      {
        q: "My task was rejected — what now?",
        a: "The Team Leader's feedback appears on the task, the same way a rejected leave request works. Fix whatever they asked for and submit it again.",
        roles: ["associate", "oic"],
      },
      {
        q: "How do I create a task?",
        a: "Members Tasks → Add task. Set the description, who it is for (all members or specific people), an optional deadline, and three switches: whether it blocks schedule and leave access until approved, whether a photo is required as proof, and whether a completion date must be entered. Blocking is the strong one — use it only when the work genuinely has to happen before someone's next shift.",
        roles: ["team_leader"],
      },
      {
        q: "How do I approve or reject a submission?",
        a: "Submissions appear on Members Tasks with the member's name, their completion date and their photo if one was required. Approve to clear the task and lift any blocking. Reject with feedback — the member sees exactly what you wrote and can resubmit.",
        roles: ["team_leader"],
      },
      {
        q: "How do I see who is falling behind?",
        a: "Task Report in the sidebar is the full history of every task and every submission, so you can see at a glance who needs following up rather than reading the live list task by task.",
        roles: ["team_leader", "oic"],
      },
      {
        q: "What is \"Poke\"?",
        a: "A nudge. It sends the member a notification about an outstanding task without you having to message them separately.",
        roles: ["team_leader"],
      },
    ],
  },
  {
    title: "Account Security",
    items: [
      {
        q: "What is the password rule?",
        a: `Your password on the platform expires ${PASSWORD_VALID_DAYS} days after you reset it. The countdown on your Dashboard shows exactly how long is left, down to the second. Rule one is that nobody's password lapses — reset it before it runs out, not after.`,
      },
      {
        q: "When does it start blocking me?",
        a: `From ${BLOCK_WITHIN_DAYS} days before expiry — day ${PASSWORD_VALID_DAYS - BLOCK_WITHIN_DAYS} of the cycle. Blocking is the same as a blocking task: no future dates on the Weekly Schedule, no tomorrow's station on the Dashboard, and no filing a Leave Request until it is sorted. The countdown turns amber well before that as a warning.`,
        roles: ["associate", "oic"],
      },
      {
        q: "MFA and passkey — which is mandatory?",
        a: "MFA is mandatory and must be uploaded AND verified by the Team Leader before you can report a password reset. A passkey is strongly recommended but optional — a missing passkey is flagged and never blocks anything.",
        roles: ["associate", "oic"],
      },
      {
        q: "What counts as proof of a reset?",
        a: "A screenshot of the platform's own Security info › Password › \"Last updated\" line. That page is authoritative, carries the timestamp, and is always in the same place — a confirmation email is none of those things. There is a sample image on the Account Security page showing exactly what to capture.",
        roles: ["associate", "oic"],
      },
      {
        q: "How do I report that I have reset my password?",
        a: "Account Security → \"Password Reset Complete\". Enter the date you actually reset it and attach the \"Last updated\" screenshot. The button stays unavailable until your MFA screenshot is uploaded and verified. Your countdown does NOT restart yet — it restarts when the Team Leader confirms.",
        roles: ["associate", "oic"],
      },
      {
        q: "Does confirmation restart my clock from today?",
        a: `No — from the date YOU reported, not the date it was confirmed. If you reset on Monday and it is confirmed on Thursday, your ${PASSWORD_VALID_DAYS} days still run from Monday. A late confirmation never hands out extra days.`,
      },
      {
        q: "Can I see everyone's status?",
        a: "No. Your own row is yours alone. Only the Team Leader sees the whole team's credential board.",
        roles: ["associate", "oic"],
      },
      {
        q: "How do I confirm someone's reset?",
        a: `Account Security shows every member: their status, time left, expiry date, reset proof, MFA and passkey. A claimed reset shows the date the member reported and a link to their screenshot — check the two against each other, then Confirm. Confirming restarts their ${PASSWORD_VALID_DAYS} days from the date they reported. Reject with an instruction if the proof does not match; they see exactly what you wrote.`,
        roles: ["team_leader"],
      },
      {
        q: "Why is Confirm greyed out on someone?",
        a: "Because their MFA screenshot has not been verified. Uploading is not enough — you have to verify it, and replacing a verified screenshot sends it back for checking. A missing or unverified passkey is flagged but never blocks confirmation.",
        roles: ["team_leader"],
      },
      {
        q: "Someone has no countdown at all — what do I do?",
        a: "They have no baseline. Set one from their row on Account Security using the date of their last known reset. Until then they are treated as blocking.",
        roles: ["team_leader"],
      },
      {
        q: "Does any of this apply to me as Team Leader?",
        a: "Your own row is a record, not a compliance check — you set the policy. Upload what you like, and nothing on that page gates you or blocks your access. Your reports are confirmed as you submit them.",
        roles: ["team_leader"],
      },
      {
        q: "Will I be reminded before it expires?",
        a: "Yes. A reminder lands in your notifications as expiry approaches, once a day at most, so it does not go unnoticed while you are busy.",
      },
    ],
  },
  {
    title: "Team Feed & Announcements",
    items: [
      {
        q: "What is the Team Feed for?",
        a: "Day-to-day posts from anyone on the team. You can react to a post and comment on it, and mention a colleague with @ so they get a notification. Everyone can see who reacted to any post.",
      },
      {
        q: "How do I post quickly?",
        a: "The \"What's on your mind?\" box at the top of your Dashboard opens the composer without leaving the page.",
      },
      {
        q: "What is the difference between the Feed and Announcements?",
        a: "The Feed is conversation. An Announcement is something everybody must actually read, so it pops up as a modal after login rather than waiting to be scrolled past.",
      },
      {
        q: "Why did the same announcement pop up again?",
        a: "A new announcement is shown on three separate logins before it retires, so one distracted click does not make you miss it. The footer tells you which showing you are on (\"Reminder 2 of 3\", then \"Last reminder\"). Refreshing the page does not use one up — only a fresh login does.",
      },
      {
        q: "How do I post an announcement?",
        a: "Announcements → post it there. Keep it for things that genuinely need everyone's attention — it interrupts all fifteen people at login three times over.",
        roles: ["team_leader"],
      },
    ],
  },
  {
    title: "Concerns",
    items: [
      {
        q: "How do I raise a concern?",
        a: "Concerns in the sidebar. Your submission is anonymous — your identity is not attached to it and the Team Leader cannot see who filed it.",
        roles: ["associate", "oic"],
      },
      {
        q: "What do I see on Concerns?",
        a: "Anonymous incident reports from the team, without the reporter's identity. Treat them as signal about the floor rather than something to trace back to a person.",
        roles: ["team_leader"],
      },
    ],
  },
  {
    title: "Notifications",
    items: [
      {
        q: "What is the bell for?",
        a: "In-app notifications, separate from email. It covers schedule publishing and changes, leave request submissions and decisions, task assignments, submissions, reviews and pokes, password reset claims, reviews and expiry reminders, announcements, and feed mentions, reactions and comments.",
      },
      {
        q: "How do I clear them?",
        a: "\"Mark all as read\" at the top of the bell panel.",
      },
      {
        q: "Do the Settings toggles turn the bell off?",
        a: "No — Settings → Notifications controls EMAIL only. The bell always shows everything that concerns you.",
      },
    ],
  },
  {
    title: "Holidays",
    roles: ["team_leader"],
    items: [
      {
        q: "How do I set a holiday?",
        a: "From the Weekly Schedule. Holidays are set by hand rather than pulled from a national calendar, because Naga's local holidays are not in one.",
      },
      {
        q: "What happens to a schedule already generated on that date?",
        a: "It is cleared — assignments and breaks both — and everyone who loses a shift is notified. Generating a new week skips holiday dates entirely, and the Dashboard's \"tomorrow\" jumps over a holiday to the next working day.",
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
      <PageHeader
        title="User Guide"
        subtitle={`How to use CRS Naga — showing only what ${
          canManage ? "you can manage" : "applies to you"
        } as ${ROLE_LABEL[profile.role]}.`}
      />

      {visibleSections.map((section) => (
        <Panel key={section.title} title={section.title}>
          <dl className="flex flex-col divide-y divide-[var(--line)]/60">
            {section.items.map((item, i) => (
              <div key={item.q} className={i === 0 ? "pb-3.5" : "py-3.5 last:pb-0"}>
                <dt className="text-[13px] font-bold mb-1 text-[var(--ink)]">{item.q}</dt>
                <dd className="text-[13px] text-[var(--muted)] m-0 leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ))}
    </>
  );
}
