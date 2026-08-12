"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill } from "@/components/ui";
import type { TenureGroup } from "@/lib/database.types";

type AssociateRow = {
  id: string;
  first_name: string;
  last_name: string;
  tenure_group: TenureGroup;
};

// Team-Leader-only control to label each active associate as Tenured or New
// Hire. Manual only — no auto-promotion by tenure date. This is purely a
// label for now; the auto-shuffle rule that will eventually read it isn't
// decided yet.
export default function TenureGroupsForm({ associates }: { associates: AssociateRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function setGroup(id: string, group: TenureGroup) {
    setPendingId(id);
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("profiles").update({ tenure_group: group }).eq("id", id);
      setPendingId(null);
      router.refresh();
    });
  }

  if (associates.length === 0) {
    return <p className="text-sm text-[var(--muted)] m-0">No active associates yet.</p>;
  }

  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr>
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">
            Associate
          </th>
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">
            Group
          </th>
        </tr>
      </thead>
      <tbody>
        {associates.map((a) => (
          <tr key={a.id}>
            <td className="py-2.5 border-b border-[var(--line)]">
              {a.first_name} {a.last_name}
            </td>
            <td className="py-2.5 border-b border-[var(--line)]">
              <div className="flex items-center gap-2">
                <Pill tone={a.tenure_group === "tenured" ? "good" : "accent"}>
                  {a.tenure_group === "tenured" ? "Tenured" : "New Hire"}
                </Pill>
                <select
                  value={a.tenure_group}
                  disabled={pendingId === a.id}
                  onChange={(e) => setGroup(a.id, e.target.value as TenureGroup)}
                  className="text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
                >
                  <option value="new_hire">New Hire</option>
                  <option value="tenured">Tenured</option>
                </select>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
