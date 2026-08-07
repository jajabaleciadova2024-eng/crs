"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NotificationPrefs } from "@/lib/database.types";

export default function NotificationPrefsForm({
  prefs,
  profileId,
  showReviewToggle,
}: {
  prefs: NotificationPrefs | null;
  profileId: string;
  showReviewToggle: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(field: keyof NotificationPrefs, current: boolean) {
    startTransition(async () => {
      const supabase = createClient();
      await supabase
        .from("notification_prefs")
        .update({ [field]: !current })
        .eq("profile_id", profileId);
      router.refresh();
    });
  }

  const rows: { field: keyof NotificationPrefs; label: string; show: boolean }[] = [
    { field: "on_own_leave_status_change", label: "Email me when a leave request I filed changes status", show: true },
    { field: "on_schedule_published", label: "Email me when my weekly station assignment is published", show: true },
    { field: "on_new_leave_to_review", label: "Email me when a new leave request needs my review", show: showReviewToggle },
  ];

  return (
    <table className="w-full text-[13px] border-collapse">
      <tbody>
        {rows
          .filter((r) => r.show)
          .map((r) => (
            <tr key={r.field}>
              <td className="py-2.5 border-b border-[var(--line)]">{r.label}</td>
              <td className="py-2.5 border-b border-[var(--line)] text-right">
                <input
                  type="checkbox"
                  checked={Boolean(prefs?.[r.field])}
                  disabled={pending}
                  onChange={() => toggle(r.field, Boolean(prefs?.[r.field]))}
                />
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
