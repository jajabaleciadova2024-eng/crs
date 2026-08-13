"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/lib/database.types";

// Team-Leader-only "view app as" switcher. See requireProfileWithPreview in
// src/lib/auth.ts — setting this makes the entire app (nav, page guards,
// buttons, User Guide) behave exactly as the selected role would see it.
export default function PreviewRoleSwitcher({ currentRole }: { currentRole: AppRole }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setPreview(role: AppRole) {
    startTransition(async () => {
      await fetch("/api/preview-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      router.refresh();
    });
  }

  return (
    <div className="px-2.5 py-2 rounded border border-dashed border-[var(--line)]">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Preview as</div>
      <select
        value={currentRole}
        disabled={pending}
        onChange={(e) => setPreview(e.target.value as AppRole)}
        className="w-full text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
      >
        <option value="team_leader">Team Leader (you)</option>
        <option value="oic">OIC</option>
        <option value="associate">Associate</option>
      </select>
    </div>
  );
}
