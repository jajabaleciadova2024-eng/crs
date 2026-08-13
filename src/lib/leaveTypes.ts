// Leave type configuration lives in org_settings.leave_type_configs (jsonb),
// editable by the Team Leader from Settings. Each type has a "behavior"
// that drives special handling elsewhere in the app:
//   - "review": standard flow, Team Leader approves/rejects manually.
//   - "auto_approve_document": e.g. Sick/Bereavement — labeled "Pre-approved"
//     since the associate can file it before they have the document in
//     hand, but the Team Leader still has to click Approve, and can't do so
//     until a supporting document has been uploaded (enforced both client-
//     side — the Approve button stays disabled — and server-side in the
//     PATCH /api/leave/[id] route). If the document never shows up, the
//     Team Leader rejects it instead.
//   - "vacation_conflict": e.g. Vacation — org-wide "1 person on leave per
//     day" conflict checking against everyone else's requests of this
//     behavior, with a soft warning (not a hard block) if a date collides.

export type LeaveTypeBehavior = "review" | "auto_approve_document" | "vacation_conflict";

export type LeaveTypeConfig = {
  key: string;
  label: string;
  behavior: LeaveTypeBehavior;
};

export const DEFAULT_LEAVE_TYPE_CONFIGS: LeaveTypeConfig[] = [
  { key: "vacation", label: "Vacation", behavior: "vacation_conflict" },
  { key: "sick", label: "Sick", behavior: "auto_approve_document" },
  { key: "bereavement", label: "Bereavement", behavior: "auto_approve_document" },
  { key: "emergency", label: "Emergency", behavior: "review" },
  { key: "other", label: "Other", behavior: "review" },
];

export const BEHAVIOR_LABEL: Record<LeaveTypeBehavior, string> = {
  review: "Standard review",
  auto_approve_document: "Pre-approved (approval held until document uploaded)",
  vacation_conflict: "Vacation-style (1 person/day, conflict check)",
};

export function findLeaveTypeConfig(configs: LeaveTypeConfig[], key: string): LeaveTypeConfig | undefined {
  return configs.find((c) => c.key === key);
}

// Slugifies a label into a stable key (lowercase, alnum + underscores).
// Used when the Team Leader adds a new type in Settings.
export function slugifyLeaveTypeKey(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "type"
  );
}
