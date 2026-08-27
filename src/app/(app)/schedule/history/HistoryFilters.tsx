"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";

// Filters drive the query through the URL rather than client state, so a
// traced incident can be linked to or bookmarked exactly as viewed.
export default function HistoryFilters({
  members,
  stations,
}: {
  members: { id: string; first_name: string; last_name: string }[];
  stations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/schedule/history?${next.toString()}`);
  }

  const inputClass =
    "px-2.5 py-1.5 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">From date</span>
        <input
          type="date"
          className={inputClass}
          defaultValue={params.get("from") ?? ""}
          onChange={(e) => apply("from", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">To date</span>
        <input
          type="date"
          className={inputClass}
          defaultValue={params.get("to") ?? ""}
          onChange={(e) => apply("to", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Member</span>
        <select className={inputClass} defaultValue={params.get("member") ?? ""} onChange={(e) => apply("member", e.target.value)}>
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.first_name} {m.last_name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Station</span>
        <select className={inputClass} defaultValue={params.get("station") ?? ""} onChange={(e) => apply("station", e.target.value)}>
          <option value="">All stations</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {[...params.keys()].length > 0 && (
        <Button onClick={() => router.push("/schedule/history")}>Clear filters</Button>
      )}
    </div>
  );
}
