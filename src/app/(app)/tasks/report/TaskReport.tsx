"use client";

import { useMemo, useState } from "react";
import { Panel, Pill } from "@/components/ui";

export type ReportRow = {
  profileId: string;
  name: string;
  status: "none" | "pending" | "approved" | "rejected";
  submittedAt: string | null;
  completionDate: string | null;
  reviewNote: string | null;
  hasPhoto: boolean;
};

export type ReportTask = {
  id: string;
  title: string;
  deadline: string | null;
  assignTo: string;
  requiresApproval: boolean;
  requiresPhoto: boolean;
  requiresCompletionDate: boolean;
  blockingNow: boolean;
  rows: ReportRow[];
};

const STATUS: Record<ReportRow["status"], { label: string; tone: "muted" | "warn" | "good" | "bad" }> = {
  none: { label: "Not submitted", tone: "muted" },
  pending: { label: "Awaiting review", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Declined", tone: "bad" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

type Filter = "all" | "followup" | "pending" | "approved";

export default function TaskReport({ tasks }: { tasks: ReportTask[] }) {
  const [filter, setFilter] = useState<Filter>("followup");
  const [query, setQuery] = useState("");

  const matches = (r: ReportRow) => {
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "followup") return r.status === "none" || r.status === "rejected";
    if (filter === "pending") return r.status === "pending";
    if (filter === "approved") return r.status === "approved";
    return true;
  };

  // Hide a task entirely once nothing in it matches, so a "needs follow-up"
  // view is a short list of real work rather than a wall of empty tables.
  const visible = useMemo(
    () => tasks.map((t) => ({ ...t, rows: t.rows.filter(matches) })).filter((t) => t.rows.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, filter, query],
  );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "followup", label: "Needs follow-up" },
    { key: "pending", label: "Awaiting review" },
    { key: "approved", label: "Approved" },
    { key: "all", label: "All" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1.5 rounded-md text-[11.5px] font-bold transition-colors cursor-pointer ${
                filter === f.key
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--muted)] hover:bg-[var(--paper-raised)] hover:text-[var(--ink)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search member…"
          className="flex-1 min-w-[140px] max-w-[240px] px-2.5 py-1.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[12px] text-[var(--ink)]"
        />
      </div>

      {visible.length === 0 ? (
        <Panel title="Nothing here">
          <p className="text-sm text-[var(--muted)] m-0">
            No member matches this filter — nothing to follow up on.
          </p>
        </Panel>
      ) : (
        visible.map((t) => (
          <Panel
            key={t.id}
            title={t.title}
            hint={`${t.rows.length} member${t.rows.length !== 1 ? "s" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px] text-[var(--muted)]">
              {t.blockingNow && <Pill tone="warn">Blocking now</Pill>}
              {t.assignTo === "all" ? <Pill tone="accent">All members</Pill> : <Pill>Individual</Pill>}
              <span>Deadline: {t.deadline ? fmtDate(t.deadline) : "none"}</span>
              {!t.requiresApproval && <span>· No approval needed</span>}
              {t.requiresPhoto && <span>· Photo required</span>}
              {t.requiresCompletionDate && <span>· Date required</span>}
            </div>

            <div className="overflow-x-auto scroll-shadow-x">
              <table className="w-full text-[13px] border-collapse min-w-[520px]">
                <thead>
                  <tr>
                    {["Member", "Status", "Completed on", "Submitted", "Note"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.profileId}>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                        {r.name}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                        <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap">
                        {fmtDate(r.completionDate)}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap">
                        {r.submittedAt ? fmtDate(r.submittedAt) : "—"}
                        {r.hasPhoto && <span className="ml-1.5">📷</span>}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)]">
                        <span className="block max-w-[220px] break-words">{r.reviewNote ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}
    </>
  );
}
