"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import type { OrgSettings, ScheduleCadence } from "@/lib/database.types";

export default function OrgSettingsForm({ settings }: { settings: OrgSettings }) {
  const [cadence, setCadence] = useState<ScheduleCadence>(settings.schedule_cadence);
  const [requireReason, setRequireReason] = useState(settings.require_leave_reason);
  const [leaveTypes, setLeaveTypes] = useState(settings.leave_types.join(", "));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase
        .from("org_settings")
        .update({
          schedule_cadence: cadence,
          require_leave_reason: requireReason,
          leave_types: leaveTypes.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        })
        .eq("id", settings.id);
      router.refresh();
    });
  }

  return (
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
          <td className="py-2.5 border-b border-[var(--line)]">Leave types offered</td>
          <td className="py-2.5 border-b border-[var(--line)] text-right">
            <input
              value={leaveTypes}
              onChange={(e) => setLeaveTypes(e.target.value)}
              className="text-xs border border-[var(--line)] rounded px-2 py-1.5 bg-[var(--paper)] w-56"
              placeholder="sick, vacation, emergency, other"
            />
          </td>
        </tr>
        <tr>
          <td className="py-2.5 border-b border-[var(--line)]">Require reason on leave requests</td>
          <td className="py-2.5 border-b border-[var(--line)] text-right">
            <input type="checkbox" checked={requireReason} onChange={(e) => setRequireReason(e.target.checked)} />
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2} className="pt-3 text-right">
            <Button variant="primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save organization settings"}
            </Button>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
