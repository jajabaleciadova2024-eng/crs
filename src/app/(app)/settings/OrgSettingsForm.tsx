"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import type { OrgSettings, ScheduleCadence } from "@/lib/database.types";
import { BEHAVIOR_LABEL, slugifyLeaveTypeKey, type LeaveTypeBehavior, type LeaveTypeConfig } from "@/lib/leaveTypes";

export default function OrgSettingsForm({ settings }: { settings: OrgSettings }) {
  const [cadence, setCadence] = useState<ScheduleCadence>(settings.schedule_cadence);
  const [requireReason, setRequireReason] = useState(settings.require_leave_reason);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeConfig[]>(settings.leave_type_configs);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateType(index: number, field: "label" | "behavior", value: string) {
    setLeaveTypes((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: field === "behavior" ? (value as LeaveTypeBehavior) : value } : t))
    );
  }

  function addType() {
    setLeaveTypes((prev) => [...prev, { key: `custom_${prev.length}`, label: "New type", behavior: "review" }]);
  }

  function removeType(index: number) {
    setLeaveTypes((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    startTransition(async () => {
      const supabase = createClient();
      // Re-derive keys from labels for any freshly-added types (kept stable
      // for existing ones so historical leave_requests rows still resolve).
      const finalized = leaveTypes.map((t) => (t.key.startsWith("custom_") ? { ...t, key: slugifyLeaveTypeKey(t.label) } : t));
      await supabase
        .from("org_settings")
        .update({
          schedule_cadence: cadence,
          require_leave_reason: requireReason,
          leave_type_configs: finalized,
        })
        .eq("id", settings.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-[13px] border-collapse">
        <tbody>
          <tr>
            <td className="py-2.5 border-b border-[var(--line)]">Schedule generation cadence</td>
            <td className="py-2.5 border-b border-[var(--line)] text-right">
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as ScheduleCadence)}
                className="text-xs border border-[var(--line)] rounded px-2 py-1.5 bg-[var(--paper)]"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
              </select>
            </td>
          </tr>
          <tr>
            <td className="py-2.5 border-b border-[var(--line)]">Require reason on leave requests</td>
            <td className="py-2.5 border-b border-[var(--line)] text-right">
              <input type="checkbox" checked={requireReason} onChange={(e) => setRequireReason(e.target.checked)} />
            </td>
          </tr>
        </tbody>
      </table>

      <div>
        <div className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">Leave types</div>
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2 border-b border-[var(--line)]">Label</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2 border-b border-[var(--line)]">Behavior</th>
                <th className="py-2 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((t, i) => (
                <tr key={t.key}>
                  <td className="py-2 border-b border-[var(--line)]">
                    <input
                      value={t.label}
                      onChange={(e) => updateType(i, "label", e.target.value)}
                      className="w-full min-w-[110px] text-xs border border-[var(--line)] rounded px-2 py-1.5 bg-[var(--paper)]"
                    />
                  </td>
                  <td className="py-2 border-b border-[var(--line)]">
                    <select
                      value={t.behavior}
                      onChange={(e) => updateType(i, "behavior", e.target.value)}
                      className="text-xs border border-[var(--line)] rounded px-2 py-1.5 bg-[var(--paper)] min-w-[220px]"
                    >
                      {(Object.keys(BEHAVIOR_LABEL) as LeaveTypeBehavior[]).map((b) => (
                        <option key={b} value={b}>
                          {BEHAVIOR_LABEL[b]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 border-b border-[var(--line)]">
                    <Button style={{ padding: "5px 10px" }} onClick={() => removeType(i)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addType} className="text-xs font-bold text-[var(--accent-strong)] mt-2">
          + Add leave type
        </button>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save organization settings"}
        </Button>
      </div>
    </div>
  );
}
