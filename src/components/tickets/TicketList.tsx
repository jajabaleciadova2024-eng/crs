"use client";

import { useState, useEffect, useCallback } from "react";
import type { AppRole } from "@/lib/database.types";
import TicketComposer from "./TicketComposer";
import TicketThread from "./TicketThread";

type Attachment = {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
};

type TicketSummary = {
  id: string;
  subject: string;
  description: string;
  status: "open" | "closed";
  is_own: boolean;
  closed_at: string | null;
  created_at: string;
  ticket_attachments: Attachment[];
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function TicketList({
  userId,
  currentUserRole,
}: {
  userId: string;
  currentUserRole: AppRole;
}) {
  const isTL = currentUserRole === "team_leader";
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/tickets${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTickets(data.tickets);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // If a ticket is selected, show the thread view
  if (selectedId) {
    return (
      <TicketThread
        ticketId={selectedId}
        isTL={isTL}
        onBack={() => {
          setSelectedId(null);
          fetchTickets();
        }}
        onStatusChange={fetchTickets}
      />
    );
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Composer — anyone can submit */}
      <TicketComposer onCreated={fetchTickets} />

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[var(--paper)] rounded-lg p-1 border border-[var(--line)] w-fit">
        {(["all", "open", "closed"] as const).map((f) => {
          const count = f === "all" ? tickets.length : f === "open" ? openCount : closedCount;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors capitalize ${
                filter === f
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {f} {count > 0 && <span className="ml-0.5 opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Ticket cards */}
      {loading ? (
        <div className="py-16 text-center text-[13px] text-[var(--muted)]">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[var(--muted)]">
          <div className="text-3xl mb-2">🛡️</div>
          {isTL ? "No concerns have been submitted yet." : "You haven't submitted any concerns yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className="w-full text-left px-4 py-3.5 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] hover:border-[var(--accent)] transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                        t.status === "open"
                          ? "bg-[var(--good-soft)] text-[var(--good-strong)]"
                          : "bg-[var(--muted)]/15 text-[var(--muted)]"
                      }`}
                    >
                      {t.status}
                    </span>
                    {t.ticket_attachments.length > 0 && (
                      <span className="text-[10px] text-[var(--muted)]">
                        📎 {t.ticket_attachments.length}
                      </span>
                    )}
                  </div>
                  <h3 className="text-[13.5px] font-semibold text-[var(--ink)] m-0 leading-snug group-hover:text-[var(--accent-strong)] transition-colors">
                    {t.subject}
                  </h3>
                  <p className="text-[12px] text-[var(--muted)] m-0 mt-0.5 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                </div>
                <div className="text-[10.5px] text-[var(--muted)] shrink-0 text-right">
                  <div>{timeAgo(t.created_at)}</div>
                  {t.is_own && (
                    <div className="text-[9px] font-semibold text-[var(--accent-strong)] mt-0.5">YOUR TICKET</div>
                  )}
                  {!t.is_own && isTL && (
                    <div className="text-[9px] font-semibold text-[var(--muted)] mt-0.5">ANONYMOUS</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
