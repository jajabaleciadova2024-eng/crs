"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import AnnouncementCard from "./AnnouncementCard";
import AnnouncementComposer from "./AnnouncementComposer";
import type { Mentionable } from "@/components/feed/mentions";

export type ReactionType = "like" | "heart" | "angry" | "poop" | "roll_eyes";
export type Reaction = { id: string; profile_id: string; reaction: ReactionType };
export type CommentAuthor = { first_name: string; last_name: string; avatar_url: string | null };
export type Comment = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: CommentAuthor;
};
export type AnnouncementAuthor = { first_name: string; last_name: string; avatar_url: string | null; role: string };
export type Announcement = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  profiles: AnnouncementAuthor;
  announcement_reactions: Reaction[];
  announcement_comments: Comment[];
  /** Signed, short-lived URLs for the attached images, in attachment order.
      The bucket is private, so these come from the API, not from the row. */
  image_urls?: string[];
};

export default function AnnouncementsFeed({
  userId,
  currentUserRole,
  mentionable,
}: {
  userId: string;
  currentUserRole: string;
  mentionable: Mentionable[];
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  const fetchAnnouncements = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const url = `/api/announcements${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { announcements: [] as Announcement[], hasMore: false };
    return res.json() as Promise<{ announcements: Announcement[]; hasMore: boolean }>;
  }, []);

  useEffect(() => {
    fetchAnnouncements().then(({ announcements, hasMore: more }) => {
      setItems(announcements);
      setHasMore(more);
      setLoading(false);
    });
  }, [fetchAnnouncements]);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();

    const annChannel = supabase
      .channel("announcements-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, async () => {
        const res = await fetch("/api/announcements?limit=1", { cache: "no-store" });
        if (!res.ok) return;
        const { announcements: latest } = await res.json();
        if (latest?.[0]) {
          setItems((prev) => {
            if (prev.some((a) => a.id === latest[0].id)) return prev;
            return [latest[0], ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "announcements" }, (payload) => {
        const updated = payload.new as { id: string; title: string; body: string; updated_at: string };
        setItems((prev) => prev.map((a) => (a.id === updated.id ? { ...a, title: updated.title, body: updated.body, updated_at: updated.updated_at } : a)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "announcements" }, (payload) => {
        const deleted = payload.old as { id: string };
        setItems((prev) => prev.filter((a) => a.id !== deleted.id));
      })
      .subscribe();

    const reactionsChannel = supabase
      .channel("announcements-reactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reactions" }, (payload) => {
        const row = (payload.new ?? payload.old) as { id: string; announcement_id: string; profile_id: string; reaction: string };
        const annId = row.announcement_id ?? (payload.old as { announcement_id: string })?.announcement_id;
        if (!annId) return;

        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as { id: string; announcement_id: string };
          setItems((prev) => prev.map((a) => a.id === oldRow.announcement_id ? { ...a, announcement_reactions: a.announcement_reactions.filter((r) => r.id !== oldRow.id) } : a));
        } else if (payload.eventType === "INSERT") {
          const newRow = payload.new as Reaction & { announcement_id: string };
          setItems((prev) => prev.map((a) => a.id === newRow.announcement_id ? { ...a, announcement_reactions: [...a.announcement_reactions.filter((r) => r.profile_id !== newRow.profile_id), { id: newRow.id, profile_id: newRow.profile_id, reaction: newRow.reaction }] } : a));
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as Reaction & { announcement_id: string };
          setItems((prev) => prev.map((a) => a.id === updated.announcement_id ? { ...a, announcement_reactions: a.announcement_reactions.map((r) => r.id === updated.id ? { ...r, reaction: updated.reaction } : r) } : a));
        }
      })
      .subscribe();

    const commentsChannel = supabase
      .channel("announcements-comments")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcement_comments" }, async (payload) => {
        const nc = payload.new as { id: string; announcement_id: string; author_id: string; content: string; created_at: string; updated_at: string };
        const res = await fetch(`/api/announcements/${nc.announcement_id}/comments/${nc.id}`, { cache: "no-store" });
        const joined = res.ok ? (await res.json()).comment : null;
        setItems((prev) => prev.map((a) => a.id === nc.announcement_id ? { ...a, announcement_comments: [...a.announcement_comments.filter((c) => c.id !== nc.id), joined ?? { id: nc.id, author_id: nc.author_id, content: nc.content, created_at: nc.created_at, updated_at: nc.updated_at, profiles: { first_name: "", last_name: "", avatar_url: null } }] } : a));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "announcement_comments" }, (payload) => {
        const updated = payload.new as { id: string; announcement_id: string; content: string; updated_at: string };
        setItems((prev) => prev.map((a) => a.id === updated.announcement_id ? { ...a, announcement_comments: a.announcement_comments.map((c) => c.id === updated.id ? { ...c, content: updated.content, updated_at: updated.updated_at } : c) } : a));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "announcement_comments" }, (payload) => {
        const deleted = payload.old as { id: string; announcement_id: string };
        setItems((prev) => prev.map((a) => a.id === deleted.announcement_id ? { ...a, announcement_comments: a.announcement_comments.filter((c) => c.id !== deleted.id) } : a));
      })
      .subscribe();

    channelsRef.current = [annChannel, reactionsChannel, commentsChannel];
    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, []);

  async function handleNewAnnouncement(title: string, body: string, images: File[]) {
    // Multipart only when there is actually something to upload — a plain
    // text announcement stays a plain JSON post.
    let res: Response;
    if (images.length > 0) {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", body);
      for (const f of images) fd.append("images", f);
      res = await fetch("/api/announcements", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
    }
    if (!res.ok) return;
    const { announcement } = await res.json();
    setItems((prev) => {
      if (prev.some((a) => a.id === announcement.id)) return prev;
      return [announcement, ...prev];
    });
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/announcements/${id}`, { method: "DELETE" });
  }

  async function handleEdit(id: string, title: string, body: string) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, title, body } : a)));
    await fetch(`/api/announcements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
  }

  async function handleReact(id: string, reaction: ReactionType) {
    setItems((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const existing = a.announcement_reactions.find((r) => r.profile_id === userId);
      if (existing?.reaction === reaction) {
        return { ...a, announcement_reactions: a.announcement_reactions.filter((r) => r.profile_id !== userId) };
      }
      if (existing) {
        return { ...a, announcement_reactions: a.announcement_reactions.map((r) => r.profile_id === userId ? { ...r, reaction } : r) };
      }
      return { ...a, announcement_reactions: [...a.announcement_reactions, { id: `temp-${Date.now()}`, profile_id: userId, reaction }] };
    }));
    await fetch(`/api/announcements/${id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction }),
    });
  }

  async function handleAddComment(id: string, content: string) {
    const res = await fetch(`/api/announcements/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return;
    const { comment } = await res.json();
    setItems((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      if (a.announcement_comments.some((c) => c.id === comment.id)) return a;
      return { ...a, announcement_comments: [...a.announcement_comments, comment] };
    }));
  }

  async function handleEditComment(annId: string, commentId: string, content: string) {
    setItems((prev) => prev.map((a) => a.id === annId ? { ...a, announcement_comments: a.announcement_comments.map((c) => c.id === commentId ? { ...c, content } : c) } : a));
    await fetch(`/api/announcements/${annId}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  async function handleDeleteComment(annId: string, commentId: string) {
    setItems((prev) => prev.map((a) => a.id === annId ? { ...a, announcement_comments: a.announcement_comments.filter((c) => c.id !== commentId) } : a));
    await fetch(`/api/announcements/${annId}/comments/${commentId}`, { method: "DELETE" });
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const cursor = items[items.length - 1]?.created_at;
    const { announcements: more, hasMore: moreAvailable } = await fetchAnnouncements(cursor);
    setItems((prev) => [...prev, ...more.filter((m) => !prev.some((a) => a.id === m.id))]);
    setHasMore(moreAvailable);
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl h-40" />
        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentUserRole === "team_leader" && (
        <AnnouncementComposer onSubmit={handleNewAnnouncement} />
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted)] text-sm">
          <div className="text-3xl mb-2">📢</div>
          No announcements yet.
        </div>
      ) : (
        items.map((ann) => (
          <AnnouncementCard
            key={ann.id}
            announcement={ann}
            userId={userId}
            currentUserRole={currentUserRole}
            mentionable={mentionable}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onReact={handleReact}
            onAddComment={handleAddComment}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
          />
        ))
      )}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 text-[13px] font-bold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] transition-colors"
        >
          {loadingMore ? "Loading…" : "Load older announcements"}
        </button>
      )}
    </div>
  );
}
