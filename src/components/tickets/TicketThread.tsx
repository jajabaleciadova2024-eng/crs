"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Message = {
  id: string;
  ticket_id: string;
  sender_id?: string;
  content: string;
  is_reporter: boolean;
  is_own: boolean;
  created_at: string;
};

type Attachment = {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
};

type TicketDetail = {
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
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼️";
  if (type.startsWith("video/")) return "🎬";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("excel") || type.includes("spreadsheet")) return "📊";
  return "📎";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TicketThread({
  ticketId,
  isTL,
  onBack,
  onStatusChange,
}: {
  ticketId: string;
  isTL: boolean;
  onBack: () => void;
  onStatusChange: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // Realtime messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-messages-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        () => fetchTicket()
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [ticketId, fetchTicket]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function sendMessage() {
    if (!draft.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't send message.");
        return;
      }
      setDraft("");
      fetchTicket();
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      const newStatus = ticket?.status === "open" ? "closed" : "open";
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchTicket();
        onStatusChange();
      }
    });
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-[13px] text-[var(--muted)]">Loading ticket…</div>
    );
  }

  if (!ticket) {
    return (
      <div className="py-16 text-center text-[13px] text-[var(--muted)]">
        Ticket not found.
        <button type="button" onClick={onBack} className="text-[var(--accent-strong)] ml-2 hover:underline">
          ← Back
        </button>
      </div>
    );
  }

  const isClosed = ticket.status === "closed";

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="mt-1 shrink-0 w-8 h-8 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] flex items-center justify-center transition-colors"
          aria-label="Back"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-lg text-[var(--ink)] m-0 leading-tight">{ticket.subject}</h2>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isClosed
                  ? "bg-[var(--muted)]/15 text-[var(--muted)]"
                  : "bg-[var(--good-soft)] text-[var(--good-strong)]"
              }`}
            >
              {ticket.status}
            </span>
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-2 flex-wrap">
            <span>
              {ticket.is_own ? "You submitted" : "Anonymous Reporter"} · {timeAgo(ticket.created_at)}
            </span>
            {isTL && (
              <button
                type="button"
                onClick={toggleStatus}
                disabled={pending}
                className="text-[11px] font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-50"
              >
                {isClosed ? "Reopen" : "Close Ticket"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Original report */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] p-4 mb-4">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">
          Original Report
        </div>
        <p className="text-[13px] text-[var(--ink)] whitespace-pre-wrap m-0 leading-relaxed">
          {ticket.description}
        </p>

        {/* Attachments */}
        {ticket.ticket_attachments && ticket.ticket_attachments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--line)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5">
              Attachments ({ticket.ticket_attachments.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {ticket.ticket_attachments.map((att) => (
                <a
                  key={att.id}
                  href={att.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-[12px] hover:border-[var(--accent)] transition-colors no-underline"
                >
                  <span>{fileIcon(att.file_type)}</span>
                  <span className="flex-1 min-w-0 truncate text-[var(--ink)]">{att.file_name}</span>
                  <span className="text-[var(--muted)] shrink-0">{formatSize(att.file_size)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] shrink-0">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              ))}
            </div>

            {/* Image previews */}
            {ticket.ticket_attachments.filter((a) => a.file_type.startsWith("image/")).length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {ticket.ticket_attachments
                  .filter((a) => a.file_type.startsWith("image/"))
                  .map((att) => (
                    <a key={att.id} href={att.file_path} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.file_path}
                        alt={att.file_name}
                        className="w-20 h-20 object-cover rounded-lg border border-[var(--line)] hover:border-[var(--accent)] transition-colors"
                      />
                    </a>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-2 mb-4 min-h-0">
        {messages.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">
            Conversation ({messages.length})
          </div>
        )}

        {messages.map((m) => {
          const isMe = m.is_own;
          const label = m.is_reporter
            ? (ticket.is_own ? "You" : "Anonymous Reporter")
            : "Team Leader";

          return (
            <div
              key={m.id}
              className={`flex flex-col gap-0.5 max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
            >
              <span className="text-[10px] text-[var(--muted)] px-1">{label} · {timeAgo(m.created_at)}</span>
              <div
                className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  isMe
                    ? "bg-[var(--accent)] text-white rounded-br-sm"
                    : "bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--ink)] rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose — only if ticket is open */}
      {isClosed ? (
        <div className="text-center text-[12px] text-[var(--muted)] py-4 border-t border-[var(--line)]">
          This ticket is closed.
          {isTL && (
            <button
              type="button"
              onClick={toggleStatus}
              disabled={pending}
              className="text-[var(--accent-strong)] ml-1 hover:underline disabled:opacity-50"
            >
              Reopen it
            </button>
          )}
        </div>
      ) : (
        <div className="border-t border-[var(--line)] pt-3">
          {error && (
            <p className="text-[12px] text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0 mb-2">{error}</p>
          )}
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a reply…"
              maxLength={5000}
              className="flex-1 text-[13px] border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-colors resize-none min-h-[42px] max-h-[120px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              variant="primary"
              style={{ padding: "8px 16px", alignSelf: "flex-end" }}
              disabled={pending || !draft.trim()}
              onClick={sendMessage}
            >
              {pending ? "…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
