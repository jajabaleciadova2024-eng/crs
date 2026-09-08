"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Eyebrow } from "@/components/ui";
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
      <div className="overflow-x-auto scroll-shadow-x">
        <table className="w-full text-[13px] border-collapse min-w-[320px]">
          <tbody>
            <tr>
              <td className="py-2.5 border-b border-[var(--line)]">
                <label htmlFor="org-cadence">Schedule generation cadence</label>
              </td>
              <td className="py-2.5 border-b border-[var(--line)] text-right">
                <select
                  id="org-cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as ScheduleCadence)}
                  className="text-xs border border-[var(--line)] rounded-md px-2 py-1.5 bg-[var(--paper)] text-[var(--ink)]"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="py-2.5 border-b border-[var(--line)]">
                <label htmlFor="org-require-reason">Require reason on leave requests</label>
              </td>
              <td className="py-2.5 border-b border-[var(--line)] text-right">
                <input id="org-require-reason" type="checkbox" checked={requireReason} onChange={(e) => setRequireReason(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <Eyebrow className="mb-2">Leave types</Eyebrow>
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2 border-b border-[var(--line)] whitespace-nowrap">Label</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2 border-b border-[var(--line)] whitespace-nowrap">Behavior</th>
                <th className="px-2 sm:px-3 py-2 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((t, i) => (
                <tr key={t.key}>
                  <td className="px-2 sm:px-3 py-2 border-b border-[var(--line)]">
                    <input
                      value={t.label}
                      onChange={(e) => updateType(i, "label", e.target.value)}
                      className="w-full sm:min-w-[110px] text-xs border border-[var(--line)] rounded-md px-2 py-1.5 bg-[var(--paper)] text-[var(--ink)]"
                    />
                  </td>
                  <td className="px-2 sm:px-3 py-2 border-b border-[var(--line)]">
                    <select
                      value={t.behavior}
                      onChange={(e) => updateType(i, "behavior", e.target.value)}
                      className="w-full sm:w-auto sm:min-w-[220px] text-xs border border-[var(--line)] rounded-md px-2 py-1.5 bg-[var(--paper)] text-[var(--ink)]"
                    >
                      {(Object.keys(BEHAVIOR_LABEL) as LeaveTypeBehavior[]).map((b) => (
                        <option key={b} value={b}>
                          {BEHAVIOR_LABEL[b]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 sm:px-3 py-2 border-b border-[var(--line)]">
                    <Button size="sm" variant="danger-ghost" onClick={() => removeType(i)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" onClick={addType} className="mt-2">
          + Add leave type
        </Button>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" loading={pending} onClick={save}>
          {pending ? "Saving…" : "Save organization settings"}
        </Button>
      </div>
    </div>
  );
}
