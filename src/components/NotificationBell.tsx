"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar } from "@/components/ui";

type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: "post_reaction" | "post_comment" | "comment_mention";
  post_id: string | null;
  comment_id: string | null;
  reaction: string | null;
  read: boolean;
  created_at: string;
  profiles: { first_name: string; last_name: string; avatar_url: string | null } | null;
};

const REACTION_EMOJI: Record<string, string> = {
  like: "👍",
  heart: "❤️",
  poop: "💩",
  roll_eyes: "🙄",
  angry: "😡",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function toTitleCase(v: string | null | undefined) {
  if (!v) return "";
  return v.toLowerCase().split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function describe(n: Notification): string {
  const name = toTitleCase(n.profiles?.first_name) || "Someone";
  if (n.type === "post_reaction") return `${name} reacted ${n.reaction ? REACTION_EMOJI[n.reaction] ?? "" : ""} to your post`;
  if (n.type === "post_comment") return `${name} commented on your post`;
  if (n.type === "comment_mention") return `${name} mentioned you in a comment`;
  return "";
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const { notifications, unread: u } = await res.json();
    setItems(notifications);
    setUnread(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime — refetch on any change to my notifications (simple + reliable)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => fetchAll()
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchAll]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  function handleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next && unread > 0) markAllRead();
      return next;
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--bad)] text-white text-[10px] font-bold flex items-center justify-center animate-fade-in">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-[340px] max-w-[90vw] bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-fade-in-up"
          style={{ boxShadow: "var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
            <span className="font-bold text-[13px] text-[var(--ink)]">Notifications</span>
            <Link href="/feed" onClick={() => setOpen(false)} className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--accent-strong)]">
              Go to feed
            </Link>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-[12px] text-[var(--muted)]">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[var(--muted)]">
                <div className="text-2xl mb-1">🔔</div>
                No notifications yet.
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.post_id ? `/feed#post-${n.post_id}` : "/feed"}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-2.5 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--accent-soft)]/30 transition-colors ${
                    !n.read ? "bg-[var(--accent-soft)]/15" : ""
                  }`}
                >
                  <Avatar
                    firstName={n.profiles?.first_name ?? ""}
                    lastName={n.profiles?.last_name ?? ""}
                    avatarUrl={n.profiles?.avatar_url ?? null}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-[var(--ink)] leading-snug m-0">{describe(n)}</p>
                    <span className="text-[10.5px] text-[var(--muted)]">{timeAgo(n.created_at)}</span>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
