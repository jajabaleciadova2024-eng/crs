"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Post, ReactionType } from "./SocialFeed";
import { Avatar } from "@/components/ui";
import CommentSection from "./CommentSection";
import { renderTextWithMentions, type Mentionable } from "./mentions";

// Ordered: positive → love → funny → negative
const REACTION_EMOJI: Record<string, string> = {
  like: "👍",
  heart: "❤️",
  poop: "💩",
  roll_eyes: "🙄",
  angry: "😡",
};
const REACTION_LABEL: Record<string, string> = {
  like: "Like",
  heart: "Heart",
  poop: "Poop",
  roll_eyes: "Roll Eyes",
  angry: "Angry",
};
const REACTION_ORDER: ReactionType[] = ["like", "heart", "poop", "roll_eyes", "angry"];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function PostCard({
  post,
  userId,
  currentUserRole,
  mentionable,
  onDelete,
  onEdit,
  onReact,
  onAddComment,
  onEditComment,
  onDeleteComment,
}: {
  post: Post;
  userId: string;
  currentUserRole: string;
  mentionable: Mentionable[];
  onDelete: (postId: string) => void;
  onEdit: (postId: string, content: string) => void;
  onReact: (postId: string, reaction: ReactionType) => void;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onEditComment: (postId: string, commentId: string, content: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  // Which reaction tab the "who reacted" sheet is filtered to ("all" = everyone).
  const [reactorFilter, setReactorFilter] = useState<string | null>(null);

  // Deep-link: notification on a comment/reaction sends the user to
  // /feed#post-<id>. If this card is the target, auto-open its comment
  // section so the comment they were notified about is actually visible.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === `#post-${post.id}`) setShowComments(true);
  }, [post.id]);

  const isAuthor = post.author_id === userId;
  const isTeamLeader = currentUserRole === "team_leader";
  // Edit is author-only; delete is Team Leader only (moderation).
  const canEdit = isAuthor;
  const canDelete = isTeamLeader;
  const showMenuButton = canEdit || canDelete;
  const wasEdited = post.updated_at !== post.created_at;

  // Defensive fallback — profiles CAN come back null in edge cases
  // (deleted/inactive author, RLS quirks) and reading `.first_name`
  // directly used to crash the whole feed for anyone but leadership.
  const authorFirst = post.profiles?.first_name ?? "";
  const authorLast = post.profiles?.last_name ?? "";
  const authorRole = post.profiles?.role ?? "";
  const authorAvatar = post.profiles?.avatar_url ?? null;

  // Group reactions by type with counts
  const reactionCounts: Record<string, number> = {};
  for (const r of post.post_reactions) {
    reactionCounts[r.reaction] = (reactionCounts[r.reaction] || 0) + 1;
  }
  const myReaction = post.post_reactions.find((r) => r.profile_id === userId)?.reaction;
  const totalReactions = post.post_reactions.length;

  // Who reacted. The joined profile is present on posts loaded from the API,
  // but absent on rows that arrive via realtime or an optimistic click — so
  // fall back to the mentionable roster (every active member) before giving
  // up. Without the fallback, your own just-clicked reaction would show as
  // "Someone" until the next refetch.
  const reactors = post.post_reactions.map((r) => {
    const fromRoster = mentionable.find((m) => m.id === r.profile_id);
    const first = r.profiles?.first_name ?? fromRoster?.first_name ?? "";
    const last = r.profiles?.last_name ?? fromRoster?.last_name ?? "";
    const name = `${first} ${last}`.trim();
    return {
      id: r.id,
      profileId: r.profile_id,
      reaction: r.reaction as string,
      first,
      last,
      avatarUrl: r.profiles?.avatar_url ?? null,
      name: r.profile_id === userId ? "You" : name || "Someone",
      isMe: r.profile_id === userId,
    };
  });
  // You first, then alphabetical — the same order the summary line reads in.
  const sortedReactors = [...reactors].sort((a, b) =>
    a.isMe === b.isMe ? a.name.localeCompare(b.name) : a.isMe ? -1 : 1,
  );
  const visibleReactors =
    reactorFilter && reactorFilter !== "all"
      ? sortedReactors.filter((r) => r.reaction === reactorFilter)
      : sortedReactors;
  // Hover text on the summary — the first few names without opening anything.
  const summaryNames = sortedReactors.slice(0, 3).map((r) => r.name).join(", ");
  const summaryTitle =
    totalReactions > 3 ? `${summaryNames} and ${totalReactions - 3} more` : summaryNames;

  function handleSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    onEdit(post.id, trimmed);
    setEditing(false);
  }

  return (
    <div
      id={`post-${post.id}`}
      className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-fade-in-up scroll-mt-24"
      style={{ boxShadow: "var(--shadow-xs)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <Avatar firstName={authorFirst} lastName={authorLast} avatarUrl={authorAvatar} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[var(--ink)] truncate">
              {toTitleCase(authorFirst)} {toTitleCase(authorLast)}
            </span>
            {authorRole === "team_leader" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                TL
              </span>
            )}
            {authorRole === "oic" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--warn-soft)] text-[var(--warn)]">
                OIC
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span>{timeAgo(post.created_at)}</span>
            {wasEdited && <span>· edited</span>}
          </div>
        </div>

        {/* Menu */}
        {showMenuButton && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-md hover:bg-[var(--paper)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-8 z-40 bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg shadow-lg py-1 min-w-[120px] animate-fade-in-up">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setEditContent(post.content);
                        setEditing(true);
                      }}
                      className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--accent-soft)]/40 text-[var(--ink)] transition-colors"
                    >
                      ✏️ Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(post.id);
                      }}
                      className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--bad-soft)]/40 text-[var(--bad)] transition-colors"
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={2000}
              className="w-full resize-none bg-[var(--paper)] border border-[var(--line)] rounded-lg px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
              rows={3}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-[12px] font-bold text-[var(--muted)] hover:text-[var(--ink)] rounded-md hover:bg-[var(--paper)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editContent.trim()}
                className="px-3 py-1.5 text-[12px] font-bold bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-strong)] disabled:opacity-40 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.content && (
              <p className="text-[14px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap break-words m-0">
                {renderTextWithMentions(post.content, mentionable)}
              </p>
            )}
          </>
        )}
      </div>

      {/* Post image */}
      {post.image_url && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setImageExpanded(true)}
            className="block rounded-lg overflow-hidden border border-[var(--line)] hover:border-[var(--accent)] transition-colors cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image_url}
              alt="Post attachment"
              className="max-h-[400px] max-w-full object-contain"
            />
          </button>
        </div>
      )}

      {/* Lightbox */}
      {imageExpanded && post.image_url && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
            onClick={() => setImageExpanded(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image_url}
              alt="Post attachment"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            />
            <button
              type="button"
              onClick={() => setImageExpanded(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-[20px]"
            >
              ×
            </button>
          </div>
        </>
      )}

      {/* Reaction summary + comment count */}
      {(totalReactions > 0 || post.post_comments.length > 0) && (
        <div className="flex items-center justify-between px-4 pb-2 text-[12px] text-[var(--muted)]">
          <div className="flex items-center gap-1">
            {totalReactions > 0 && (
              // Clicking opens the full list — everyone can see who reacted
              // to any post, not just the count.
              <button
                type="button"
                onClick={() => setReactorFilter("all")}
                title={summaryTitle}
                className="flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 hover:bg-[var(--paper)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              >
                <span className="flex -space-x-0.5">
                  {Object.entries(reactionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type]) => (
                      <span key={type} className="text-[14px]">
                        {REACTION_EMOJI[type]}
                      </span>
                    ))}
                </span>
                <span className="ml-1">{totalReactions}</span>
              </button>
            )}
          </div>
          {post.post_comments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowComments(!showComments)}
              className="hover:underline hover:text-[var(--ink)] transition-colors"
            >
              {post.post_comments.length} comment{post.post_comments.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex border-t border-[var(--line)]">
        {/* Reaction button with picker */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-bold transition-colors ${
              myReaction
                ? "text-[var(--accent-strong)] bg-[var(--accent-soft)]/20"
                : "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            }`}
          >
            {myReaction ? (
              <span className="text-[15px]">{REACTION_EMOJI[myReaction]}</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {myReaction ? REACTION_LABEL[myReaction] : "React"}
          </button>
          {showReactionPicker && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowReactionPicker(false)} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 flex gap-1 bg-[var(--paper-raised)] border border-[var(--line)] rounded-full px-1.5 sm:px-2 py-1.5 shadow-lg animate-fade-in-up max-w-[calc(100vw-32px)]">
                {REACTION_ORDER.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setShowReactionPicker(false);
                      onReact(post.id, type);
                    }}
                    className={`text-[22px] hover:scale-125 active:scale-100 transition-transform px-1 ${
                      myReaction === type ? "scale-110" : ""
                    }`}
                    title={REACTION_LABEL[type]}
                  >
                    {REACTION_EMOJI[type]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Comment button */}
        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-bold text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)] transition-colors border-l border-[var(--line)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Comment
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <CommentSection
          postId={post.id}
          comments={post.post_comments}
          userId={userId}
          currentUserRole={currentUserRole}
          mentionable={mentionable}
          onAdd={(content) => onAddComment(post.id, content)}
          onEdit={(commentId, content) => onEditComment(post.id, commentId, content)}
          onDelete={(commentId) => onDeleteComment(post.id, commentId)}
        />
      )}

      {/* Who reacted. Portaled to <body> so the card's own overflow-hidden
          and stacking context can't clip or trap it. */}
      {reactorFilter !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
            onClick={() => setReactorFilter(null)}
          >
            <div
              className="w-full sm:max-w-sm max-h-[75vh] flex flex-col bg-[var(--paper-raised)] border border-[var(--line)] rounded-t-2xl sm:rounded-2xl overflow-hidden"
              style={{ boxShadow: "var(--shadow-lg, 0 12px 40px rgba(0,0,0,.35))" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-[var(--line)]">
                <span className="text-[13.5px] font-bold text-[var(--ink)]">
                  Reactions ({totalReactions})
                </span>
                <button
                  type="button"
                  onClick={() => setReactorFilter(null)}
                  className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors text-[18px] leading-none cursor-pointer"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {/* Filter tabs — All, then one per reaction actually used */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--line)] overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setReactorFilter("all")}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors cursor-pointer ${
                    reactorFilter === "all"
                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      : "text-[var(--muted)] hover:bg-[var(--paper)]"
                  }`}
                >
                  All {totalReactions}
                </button>
                {REACTION_ORDER.filter((t) => reactionCounts[t] > 0).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setReactorFilter(type)}
                    title={REACTION_LABEL[type]}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors cursor-pointer ${
                      reactorFilter === type
                        ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "text-[var(--muted)] hover:bg-[var(--paper)]"
                    }`}
                  >
                    <span className="text-[13px]">{REACTION_EMOJI[type]}</span> {reactionCounts[type]}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto py-1.5">
                {visibleReactors.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 px-4 py-2">
                    <div className="relative shrink-0">
                      <Avatar firstName={r.first} lastName={r.last} avatarUrl={r.avatarUrl} size="sm" />
                      <span className="absolute -bottom-1 -right-1 text-[12px] leading-none">
                        {REACTION_EMOJI[r.reaction]}
                      </span>
                    </div>
                    <span className="text-[13px] text-[var(--ink)] truncate">
                      {r.isMe ? "You" : `${toTitleCase(r.first)} ${toTitleCase(r.last)}`.trim() || "Someone"}
                    </span>
                    <span className="ml-auto text-[11px] text-[var(--muted)] shrink-0">
                      {REACTION_LABEL[r.reaction]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function toTitleCase(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
