"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";
import type { Mentionable } from "./mentions";

export type ReactionType = "like" | "heart" | "angry" | "poop" | "roll_eyes";
// `profiles` is joined on read so the reaction list can name who reacted.
// It is absent on rows that arrive via realtime or an optimistic update —
// PostCard falls back to the mentionable roster for those, so a missing
// join never renders a nameless row.
export type Reactor = { first_name: string; last_name: string; avatar_url: string | null };
export type Reaction = { id: string; profile_id: string; reaction: ReactionType; profiles?: Reactor | null };
export type CommentAuthor = { first_name: string; last_name: string; avatar_url: string | null };
export type Comment = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: CommentAuthor;
};
export type PostAuthor = { first_name: string; last_name: string; avatar_url: string | null; role: string };
export type Post = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  profiles: PostAuthor;
  post_reactions: Reaction[];
  post_comments: Comment[];
};

export default function SocialFeed({
  userId,
  currentUserRole,
  mentionable,
  initialLimit,
  viewAllHref,
  stickyComposer,
}: {
  userId: string;
  currentUserRole: string;
  mentionable: Mentionable[];
  // Dashboard passes 10 so the feed on the home page stays a "recent
  // activity" strip; the full /feed page omits it and gets normal
  // pagination. Loaded via ?limit=N so /api/feed does the cap once
  // server-side instead of the client trimming.
  initialLimit?: number;
  // When set, the "Load older posts" button is replaced by a link to
  // this href — used on the dashboard to send people to /feed for the
  // rest instead of paginating inline.
  viewAllHref?: string;
  // Pins the composer just beneath the (fixed) PageHeader while
  // scrolling — only used on the dedicated /feed page, not the
  // dashboard's embedded Panel preview. Offset comes from --header-bottom,
  // published by PageHeader's own ResizeObserver (see ui.tsx).
  stickyComposer?: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const composerFixedRef = useRef<HTMLDivElement>(null);

  // `position: sticky` is deliberately avoided elsewhere in this app (see
  // SidebarShell/PageHeader's comments — it's empirically unreliable in
  // this layout, sticking on the way up but not engaging on the way down).
  // Same fix here: the composer becomes `position: fixed`, matching the
  // header, with a measured invisible spacer reserving its real (variable
  // — image preview/emoji picker resize it) height in the flow so posts
  // don't jump up underneath it.
  useEffect(() => {
    if (!stickyComposer) return;
    const el = composerFixedRef.current;
    if (!el) return;
    const update = () => setComposerHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stickyComposer]);

  const fetchPosts = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (initialLimit && !cursor) params.set("limit", String(initialLimit));
      const url = `/api/feed${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) return { posts: [] as Post[], hasMore: false };
      return res.json() as Promise<{ posts: Post[]; hasMore: boolean }>;
    },
    [initialLimit]
  );

  // Initial load
  useEffect(() => {
    fetchPosts().then(({ posts: fetched, hasMore: more }) => {
      setPosts(fetched);
      setHasMore(more);
      setLoading(false);
    });
  }, [fetchPosts]);

  // Scroll to & highlight a deep-linked post/comment (from a notification
  // click, e.g. /feed#post-<uuid>) once the feed has loaded. Runs after
  // `loading` flips false so the target card actually exists in the DOM.
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("feed-target-flash");
    const timer = setTimeout(() => el.classList.remove("feed-target-flash"), 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Real-time subscriptions
  useEffect(() => {
    const supabase = createClient();

    // Posts channel — new posts, edits, deletes
    const postsChannel = supabase
      .channel("feed-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        async (payload) => {
          // Fetch the full post with joins (the realtime payload is just the raw row)
          const res = await fetch(`/api/feed?limit=1`);
          if (!res.ok) return;
          const { posts: latest } = await res.json();
          if (latest?.[0]) {
            setPosts((prev) => {
              if (prev.some((p) => p.id === latest[0].id)) return prev;
              return [latest[0], ...prev];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "posts" },
        (payload) => {
          const updated = payload.new as { id: string; content: string; image_url: string | null; updated_at: string };
          setPosts((prev) =>
            prev.map((p) => (p.id === updated.id ? { ...p, content: updated.content, image_url: updated.image_url, updated_at: updated.updated_at } : p))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        (payload) => {
          const deleted = payload.old as { id: string };
          setPosts((prev) => prev.filter((p) => p.id !== deleted.id));
        }
      )
      .subscribe();

    // Reactions channel
    const reactionsChannel = supabase
      .channel("feed-reactions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_reactions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id: string; post_id: string; profile_id: string; reaction: string };
          const postId = row.post_id ?? (payload.old as { post_id: string })?.post_id;
          if (!postId) return;

          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id: string; post_id: string };
            setPosts((prev) =>
              prev.map((p) =>
                p.id === oldRow.post_id
                  ? { ...p, post_reactions: p.post_reactions.filter((r) => r.id !== oldRow.id) }
                  : p
              )
            );
          } else if (payload.eventType === "INSERT") {
            const newRow = payload.new as Reaction & { post_id: string };
            setPosts((prev) =>
              prev.map((p) =>
                p.id === newRow.post_id
                  ? {
                      ...p,
                      post_reactions: [
                        ...p.post_reactions.filter((r) => r.profile_id !== newRow.profile_id),
                        { id: newRow.id, profile_id: newRow.profile_id, reaction: newRow.reaction },
                      ],
                    }
                  : p
              )
            );
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Reaction & { post_id: string };
            setPosts((prev) =>
              prev.map((p) =>
                p.id === updated.post_id
                  ? {
                      ...p,
                      post_reactions: p.post_reactions.map((r) =>
                        r.id === updated.id ? { ...r, reaction: updated.reaction } : r
                      ),
                    }
                  : p
              )
            );
          }
        }
      )
      .subscribe();

    // Comments channel
    const commentsChannel = supabase
      .channel("feed-comments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_comments" },
        async (payload) => {
          const newComment = payload.new as { id: string; post_id: string; author_id: string; content: string; created_at: string; updated_at: string };
          // Fetch the joined comment through our API — reading profiles
          // directly from the browser client would fail for non-leadership
          // viewers under RLS (same reason we introduced the admin-backed
          // /api/feed GET in the first place).
          const res = await fetch(`/api/feed/${newComment.post_id}/comments/${newComment.id}`);
          const joined = res.ok ? (await res.json()).comment : null;

          setPosts((prev) =>
            prev.map((p) =>
              p.id === newComment.post_id
                ? {
                    ...p,
                    post_comments: [
                      ...p.post_comments.filter((c) => c.id !== newComment.id),
                      joined ?? {
                        id: newComment.id,
                        author_id: newComment.author_id,
                        content: newComment.content,
                        created_at: newComment.created_at,
                        updated_at: newComment.updated_at,
                        profiles: { first_name: "", last_name: "", avatar_url: null },
                      },
                    ],
                  }
                : p
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "post_comments" },
        (payload) => {
          const updated = payload.new as { id: string; post_id: string; content: string; updated_at: string };
          setPosts((prev) =>
            prev.map((p) =>
              p.id === updated.post_id
                ? {
                    ...p,
                    post_comments: p.post_comments.map((c) =>
                      c.id === updated.id ? { ...c, content: updated.content, updated_at: updated.updated_at } : c
                    ),
                  }
                : p
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "post_comments" },
        (payload) => {
          const deleted = payload.old as { id: string; post_id: string };
          setPosts((prev) =>
            prev.map((p) =>
              p.id === deleted.post_id
                ? { ...p, post_comments: p.post_comments.filter((c) => c.id !== deleted.id) }
                : p
            )
          );
        }
      )
      .subscribe();

    channelsRef.current = [postsChannel, reactionsChannel, commentsChannel];

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, []);

  async function handleNewPost(content: string, imageUrl?: string | null) {
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, image_url: imageUrl || null }),
    });
    if (!res.ok) return;
    const { post } = await res.json();
    // Optimistic — realtime will also deliver, but deduped by id check
    setPosts((prev) => {
      if (prev.some((p) => p.id === post.id)) return prev;
      return [post, ...prev];
    });
  }

  async function handleDeletePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await fetch(`/api/feed/${postId}`, { method: "DELETE" });
  }

  async function handleEditPost(postId: string, content: string) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, content } : p)));
    await fetch(`/api/feed/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  async function handleReact(postId: string, reaction: ReactionType) {
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const existing = p.post_reactions.find((r) => r.profile_id === userId);
        if (existing?.reaction === reaction) {
          return { ...p, post_reactions: p.post_reactions.filter((r) => r.profile_id !== userId) };
        }
        if (existing) {
          return {
            ...p,
            post_reactions: p.post_reactions.map((r) => (r.profile_id === userId ? { ...r, reaction } : r)),
          };
        }
        return {
          ...p,
          post_reactions: [...p.post_reactions, { id: `temp-${Date.now()}`, profile_id: userId, reaction }],
        };
      })
    );

    await fetch(`/api/feed/${postId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction }),
    });
  }

  async function handleAddComment(postId: string, content: string) {
    const res = await fetch(`/api/feed/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return;
    const { comment } = await res.json();
    // Optimistic — deduped by realtime
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (p.post_comments.some((c) => c.id === comment.id)) return p;
        return { ...p, post_comments: [...p.post_comments, comment] };
      })
    );
  }

  async function handleEditComment(postId: string, commentId: string, content: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, post_comments: p.post_comments.map((c) => (c.id === commentId ? { ...c, content } : c)) }
          : p
      )
    );
    await fetch(`/api/feed/${postId}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  async function handleDeleteComment(postId: string, commentId: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, post_comments: p.post_comments.filter((c) => c.id !== commentId) } : p
      )
    );
    await fetch(`/api/feed/${postId}/comments/${commentId}`, { method: "DELETE" });
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const cursor = posts[posts.length - 1]?.created_at;
    const { posts: more, hasMore: moreAvailable } = await fetchPosts(cursor);
    setPosts((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
    setHasMore(moreAvailable);
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl h-24" />
        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl h-40" />
        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stickyComposer ? (
        <>
          {/* Space-reserving clone — the real composer below is removed
              from flow (position: fixed), so this keeps posts from
              jumping up underneath it. Height is measured live since the
              composer's own height changes (image preview, emoji picker). */}
          <div aria-hidden="true" style={{ height: composerHeight ?? undefined }} />
          <div
            id="whats-on-your-mind"
            ref={composerFixedRef}
            className="fixed z-10 left-0 md:left-[var(--sidebar-width,220px)] w-full md:w-[calc(100%-var(--sidebar-width,220px))] px-3 sm:px-4 md:px-10 pt-3 pb-3 bg-[var(--paper)] transition-[left,width] duration-200 ease-out"
            style={{ top: "var(--header-bottom, 140px)" }}
          >
            <PostComposer onSubmit={handleNewPost} mentionable={mentionable} />
          </div>
        </>
      ) : (
        <div id="whats-on-your-mind">
          <PostComposer onSubmit={handleNewPost} mentionable={mentionable} />
        </div>
      )}
      {posts.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted)] text-sm">
          <div className="text-3xl mb-2">💬</div>
          No posts yet — be the first to share something!
        </div>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            userId={userId}
            currentUserRole={currentUserRole}
            mentionable={mentionable}
            onDelete={handleDeletePost}
            onEdit={handleEditPost}
            onReact={handleReact}
            onAddComment={handleAddComment}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
          />
        ))
      )}
      {hasMore &&
        (viewAllHref ? (
          <Link
            href={viewAllHref}
            className="block w-full text-center py-3 text-[13px] font-bold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] transition-colors"
          >
            See all posts →
          </Link>
        ) : (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3 text-[13px] font-bold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] transition-colors"
          >
            {loadingMore ? "Loading…" : "Load older posts"}
          </button>
        ))}
    </div>
  );
}
