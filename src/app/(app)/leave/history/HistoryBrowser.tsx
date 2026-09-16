"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import CollapsiblePeriod from "./CollapsiblePeriod";
import LeaveHistoryRow, { type HistoryRow, type LeaveTypeConfig } from "./LeaveHistoryRow";

const TH =
  "text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap";

type Period = { key: string; label: string; rows: HistoryRow[] };

export default function HistoryBrowser({
  periods,
  leaveTypeConfigs,
  canViewAll,
  isTL,
}: {
  periods: Period[];
  leaveTypeConfigs: LeaveTypeConfig[];
  canViewAll: boolean;
  isTL: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    return periods
      .map((p) => ({
        ...p,
        rows: p.rows.filter((r) => {
          if (typeFilter !== "all" && r.leave_type !== typeFilter) return false;
          if (statusFilter !== "all" && r.status !== statusFilter) return false;
          if (q) {
            const name = formatFullName(r.profiles?.first_name, r.profiles?.last_name).toLowerCase();
            const reason = (r.reason ?? "").toLowerCase();
            if (!name.includes(q) && !reason.includes(q)) return false;
          }
          return true;
        }),
      }))
      .filter((p) => p.rows.length > 0);
  }, [periods, q, typeFilter, statusFilter]);

  const hasFilters = q !== "" || typeFilter !== "all" || statusFilter !== "all";
  const totalShown = filtered.reduce((sum, p) => sum + p.rows.length, 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={canViewAll ? "Search name or reason…" : "Search reason…"}
          className="flex-1 min-w-[160px] px-3 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2.5 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
        >
          <option value="all">All types</option>
          {leaveTypeConfigs.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); }}
            className="text-[12px] font-semibold text-[var(--accent-strong)] hover:underline cursor-pointer px-1"
          >
            Clear
          </button>
        )}
      </div>

      {hasFilters && (
        <p className="text-[11.5px] text-[var(--muted)] m-0 mb-2">
          {totalShown} {totalShown === 1 ? "result" : "results"}
        </p>
      )}

      {filtered.length === 0 ? (
        <Panel title={hasFilters ? "No matches" : "No decided leave yet"}>
          <p className="text-sm text-[var(--muted)] m-0">
            {hasFilters
              ? "No leave records match your filters."
              : "Once requests are approved or rejected, they'll show up here grouped by period."}
          </p>
        </Panel>
      ) : (
        filtered.map((p) => (
          <CollapsiblePeriod
            key={`${p.key}-${hasFilters}`}
            title={p.label}
            hint={`${p.rows.length} ${p.rows.length === 1 ? "record" : "records"}`}
            defaultOpen={hasFilters}
          >
            <div className="overflow-x-auto scroll-shadow-x -mx-4 sm:-mx-5">
              <table className="w-full text-[13px] border-collapse min-w-[480px]" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  {canViewAll && <col style={{ width: isTL ? "20%" : "22%" }} />}
                  <col style={{ width: isTL ? "14%" : canViewAll ? "16%" : "18%" }} />
                  <col style={{ width: isTL ? "22%" : canViewAll ? "22%" : "28%" }} />
                  <col style={{ width: isTL ? "16%" : canViewAll ? "16%" : "22%" }} />
                  <col style={{ width: isTL ? "12%" : canViewAll ? "12%" : "16%" }} />
                  <col style={{ width: isTL ? "10%" : canViewAll ? "12%" : "16%" }} />
                  {isTL && <col style={{ width: "6%" }} />}
                </colgroup>
                <thead>
                  <tr>
                    {canViewAll && <th className={TH}>Associate</th>}
                    <th className={TH}>Type</th>
                    <th className={TH}>Dates</th>
                    <th className={TH}>Reason</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Decided</th>
                    {isTL && <th className={`${TH} px-2 text-center`}><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => {
                    const typeConfig = leaveTypeConfigs.find((c) => c.key === r.leave_type);
                    return (
                      <LeaveHistoryRow
                        key={r.id}
                        r={r}
                        canViewAll={canViewAll}
                        isTL={isTL}
                        typeConfig={
                          typeConfig
                            ? { key: typeConfig.key, label: typeConfig.label, behavior: typeConfig.behavior }
                            : undefined
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsiblePeriod>
        ))
      )}
    </>
  );
}
