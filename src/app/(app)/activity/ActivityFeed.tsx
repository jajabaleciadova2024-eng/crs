"use client";

export type ActivityItem = {
  id: string;
  type: string;
  actor: string;
  subject: string | null;
  createdAt: string;
};

// icon + phrasing per action type. {actor} did something (optionally to {subject}).
const VERB: Record<string, { icon: string; text: (subject: string | null) => string }> = {
  leave_submitted: { icon: "📝", text: () => "filed a leave request" },
  leave_reviewed: { icon: "✅", text: (s) => `reviewed ${s ? `${s}'s` : "a"} leave request` },
  leave_updated: { icon: "📝", text: (s) => `updated ${s ? `${s}'s` : "a"} leave request` },
  task_submitted: { icon: "📤", text: () => "submitted a task for approval" },
  task_reviewed: { icon: "✅", text: (s) => `reviewed ${s ? `${s}'s` : "a"} task submission` },
  task_assigned: { icon: "📋", text: (s) => `assigned a task${s ? ` to ${s}` : ""}` },
  schedule_published: { icon: "🗓️", text: () => "published a new schedule" },
  schedule_changed: { icon: "🗓️", text: (s) => `changed ${s ? `${s}'s` : "a"} station assignment` },
  announcement: { icon: "📢", text: () => "posted an announcement" },
  password_reset_submitted: { icon: "🔐", text: () => "reported a password reset" },
  password_reset_reviewed: { icon: "🔐", text: (s) => `reviewed ${s ? `${s}'s` : "a"} password reset` },
  credential_proof_submitted: { icon: "🛡️", text: () => "uploaded a security screenshot" },
  credential_proof_reviewed: { icon: "🛡️", text: (s) => `reviewed ${s ? `${s}'s` : "a"} security screenshot` },
  ticket_new: { icon: "📨", text: () => "submitted an anonymous concern" },
};

function timeOf(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  // Group consecutive items under their day heading.
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const day = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.day}>
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5 sticky top-0 bg-[var(--paper-raised)] py-1">
            {g.day}
          </h3>
          <ul className="flex flex-col gap-0.5 m-0 p-0 list-none">
            {g.items.map((item) => {
              const v = VERB[item.type];
              return (
                <li key={item.id} className="flex items-start gap-2.5 py-1.5 border-b border-[var(--line)]/50 last:border-b-0">
                  <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[13px] shrink-0">
                    {v?.icon ?? "•"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--ink)] leading-snug m-0">
                      <span className="font-semibold">{item.actor}</span>{" "}
                      {v ? v.text(item.subject) : item.type}
                    </p>
                    <span className="text-[10.5px] text-[var(--muted)]">{timeOf(item.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
