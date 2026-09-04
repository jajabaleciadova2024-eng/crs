"use client";

import { useMemo, useState } from "react";
import { Panel, Pill } from "@/components/ui";
import ProofViewer from "@/components/ProofViewer";

export type ReportRow = {
  profileId: string;
  name: string;
  status: "none" | "pending" | "approved" | "rejected";
  submittedAt: string | null;
  completionDate: string | null;
  reviewNote: string | null;
  completionId: string | null;
  photoCount: number;
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
  // Keyed by `${taskId}::${profileId}` for a single row, or the task id for
  // a whole-task nudge, so each button reports its own state.
  const [poking, setPoking] = useState<string | null>(null);
  const [poked, setPoked] = useState<Record<string, number>>({});
  const [pokeError, setPokeError] = useState<string | null>(null);
  // Which task panels are open. Collapsed by default and keyed by id, so
  // filtering or searching does not reopen everything — this page is one
  // table per task, and with a few tasks it was several screens of scrolling
  // to compare two of them.
  const [openTasks, setOpenTasks] = useState<Record<string, boolean>>({});
  const toggleTask = (id: string) => setOpenTasks((p) => ({ ...p, [id]: !p[id] }));
  // Typing a name is an explicit "find this", so searching opens the panels
  // rather than leaving the match hidden behind a collapsed header. An
  // explicit toggle still wins — `??` only fills in where there is no
  // decision on record.
  const isOpen = (id: string) => openTasks[id] ?? query.trim().length > 0;

  // Only ever sent to people who actually owe the task; the API re-checks
  // and drops anyone already approved or awaiting review.
  async function poke(taskId: string, profileIds: string[], key: string) {
    setPoking(key);
    setPokeError(null);
    const res = await fetch("/api/tasks/poke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, profile_ids: profileIds }),
    });
    setPoking(null);
    if (!res.ok) {
      setPokeError((await res.json().catch(() => ({}))).error ?? "Couldn't send that nudge.");
      return;
    }
    const { poked: n } = await res.json();
    setPoked((p) => ({ ...p, [key]: n }));
  }

  const isOutstanding = (st: ReportRow["status"]) => st === "none" || st === "rejected";

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

      {pokeError && (
        <p role="alert" className="text-[12.5px] text-[var(--bad)] mb-3">
          {pokeError}
        </p>
      )}

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
            collapsed={!isOpen(t.id)}
            onToggle={() => toggleTask(t.id)}
            action={
              (() => {
                const owing = t.rows.filter((r) => isOutstanding(r.status)).map((r) => r.profileId);
                const waiting = t.rows.filter((r) => r.status === "pending").length;
                return (
                  <span className="flex items-center gap-2 shrink-0">
                    {/* Icon, matching the same action on the Members Tasks
                        card. Two spellings of one button across two screens
                        is exactly the drift this pass is closing. */}
                    <a
                      href={`/api/tasks/${t.id}/export`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] transition-colors"
                      title={`Export "${t.title}" as CSV`}
                      aria-label={`Export "${t.title}" as CSV`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <path d="M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </a>
                    {/* Collapsed, the header is the whole row — the counts
                        have to be on it or the page says nothing until you
                        open every task in turn. */}
                    {waiting > 0 && (
                      <span className="text-[11px] font-bold text-[var(--warn)]">{waiting} to review</span>
                    )}
                    {owing.length > 0 ? (
                      <span className="text-[11px] text-[var(--muted)] font-medium">
                        {owing.length} outstanding
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--good)] font-medium">All done</span>
                    )}
                    {owing.length > 0 && (
                      <button
                        type="button"
                        onClick={() => poke(t.id, owing, t.id)}
                        disabled={poking === t.id}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {poking === t.id
                          ? "Nudging…"
                          : poked[t.id]
                            ? `Nudged ${poked[t.id]}`
                            : `Nudge all ${owing.length}`}
                      </button>
                    )}
                  </span>
                );
              })()
            }
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
                    {/* Same columns, same order as the review table on
                        Members Tasks. They describe the same rows, and a
                        Team Leader moving between the two should not have to
                        re-find which column is which — or discover that the
                        proof they could open there is missing here. */}
                    {["Member", "Submitted", "Date done", "Proof", "Status", "Note", ""].map((h) => (
                      <th
                        key={h || "actions"}
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
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap">
                        {r.submittedAt ? fmtDate(r.submittedAt) : "—"}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap">
                        {fmtDate(r.completionDate)}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                        {r.completionId && r.photoCount > 0 ? (
                          <ProofViewer
                            fetchUrl={`/api/tasks/photo/${r.completionId}`}
                            title={t.title}
                            subtitle={r.name}
                            canDownload
                            count={r.photoCount}
                          />
                        ) : t.requiresPhoto && r.status !== "none" ? (
                          <span className="text-[10.5px] text-[var(--muted)] italic">none</span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                        <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)]">
                        <span className="block max-w-[220px] break-words">{r.reviewNote ?? "—"}</span>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-right whitespace-nowrap">
                        {isOutstanding(r.status) ? (
                          poked[`${t.id}::${r.profileId}`] ? (
                            <span className="text-[11px] text-[var(--good)] font-bold">Nudged</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => poke(t.id, [r.profileId], `${t.id}::${r.profileId}`)}
                              disabled={poking === `${t.id}::${r.profileId}`}
                              title={`Send ${r.name} a reminder about this task`}
                              className="px-2 py-1 rounded-md text-[11px] font-bold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {poking === `${t.id}::${r.profileId}` ? "…" : "Nudge"}
                            </button>
                          )
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
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
