import { requireProfile, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Panel } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import ActivityFeed, { type ActivityItem } from "./ActivityFeed";

// Operational events worth an audit trail — decisions, submissions, and
// broadcasts. Pure social noise (reactions, comments, mentions, chat, poke,
// automated deadline pings) is deliberately excluded.
const AUDIT_TYPES = [
  "leave_submitted",
  "leave_reviewed",
  "leave_updated",
  "task_submitted",
  "task_reviewed",
  "task_assigned",
  "schedule_published",
  "schedule_changed",
  "announcement",
  "password_reset_submitted",
  "password_reset_reviewed",
  "credential_proof_submitted",
  "credential_proof_reviewed",
  "ticket_new",
];

export default async function ActivityLogPage() {
  const profile = await requireProfile();
  await requireRole(profile, ["team_leader"]);

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("notifications")
    .select("id, recipient_id, actor_id, type, ref_id, created_at")
    .in("type", AUDIT_TYPES)
    .order("created_at", { ascending: false })
    .limit(400);

  const ids = new Set<string>();
  for (const r of rows ?? []) {
    if (r.actor_id) ids.add(r.actor_id);
    if (r.recipient_id) ids.add(r.recipient_id);
  }
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", [...ids]);
  const nameOf = new Map(
    (profiles ?? []).map((p: { id: string; first_name: string; last_name: string }) => [
      p.id,
      formatFullName(p.first_name, p.last_name),
    ]),
  );

  // Collapse the recipient fan-out: one action becomes N notification rows
  // (one per recipient). Key by ref_id where present, else by actor+type+time
  // (a broadcast batch shares a created_at), so each real action shows once.
  const seen = new Set<string>();
  const items: ActivityItem[] = [];
  for (const r of rows ?? []) {
    const key = r.ref_id
      ? `${r.type}:${r.ref_id}`
      : `${r.type}:${r.actor_id}:${r.created_at.slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: r.id,
      type: r.type,
      actor: nameOf.get(r.actor_id) ?? "Someone",
      subject: r.recipient_id && r.recipient_id !== r.actor_id ? (nameOf.get(r.recipient_id) ?? null) : null,
      createdAt: r.created_at,
    });
  }

  return (
    <>
      <PageHeader
        title="Activity Log"
        subtitle="A record of team actions — approvals, submissions, and announcements"
      />
      {items.length === 0 ? (
        <Panel title="Nothing yet">
          <p className="text-sm text-[var(--muted)] m-0">
            Team actions will appear here as they happen.
          </p>
        </Panel>
      ) : (
        <Panel title="Recent activity" hint={`${items.length} shown`}>
          <ActivityFeed items={items} />
        </Panel>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
