"use client";

import { useState } from "react";
import type { Post } from "./SocialFeed";
import { Avatar } from "@/components/ui";
import CommentSection from "./CommentSection";

const REACTION_EMOJI: Record<string, string> = { like: "👍", heart: "❤️", angry: "😡" };
const REACTION_LABEL: Record<string, string> = { like: "Like", heart: "Heart", angry: "Angry" };

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
  onDelete,
  onEdit,
  onReact,
  onAddComment,
  onEditComment,
  onDeleteComment,
}: {
  post: Post;
  userId: string;
  onDelete: (postId: string) => void;
  onEdit: (postId: string, content: string) => void;
  onReact: (postId: string, reaction: "like" | "heart" | "angry") => void;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onEditComment: (postId: string, commentId: string, content: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const isAuthor = post.author_id === userId;
  const wasEdited = post.updated_at !== post.created_at;

  // Group reactions by type with counts
  const reactionCounts: Record<string, number> = {};
  for (const r of post.post_reactions) {
    reactionCounts[r.reaction] = (reactionCounts[r.reaction] || 0) + 1;
  }
  const myReaction = post.post_reactions.find((r) => r.profile_id === userId)?.reaction;
  const totalReactions = post.post_reactions.length;

  function handleSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    onEdit(post.id, trimmed);
    setEditing(false);
  }

  return (
    <div
      className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-fade-in-up"
      style={{ boxShadow: "var(--shadow-xs)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <Avatar
          firstName={post.profiles.first_name}
          lastName={post.profiles.last_name}
          avatarUrl={post.profiles.avatar_url}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[var(--ink)] truncate">
              {toTitleCase(post.profiles.first_name)} {toTitleCase(post.profiles.last_name)}
            </span>
            {post.profiles.role === "team_leader" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                TL
              </span>
            )}
            {post.profiles.role === "oic" && (
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
        {isAuthor && (
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
          <p className="text-[14px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap break-words m-0">
            {post.content}
          </p>
        )}
      </div>

      {/* Reaction summary + comment count */}
      {(totalReactions > 0 || post.post_comments.length > 0) && (
        <div className="flex items-center justify-between px-4 pb-2 text-[12px] text-[var(--muted)]">
          <div className="flex items-center gap-1">
            {totalReactions > 0 && (
              <>
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
              </>
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
            <span className="text-[15px]">{myReaction ? REACTION_EMOJI[myReaction] : "👍"}</span>
            {myReaction ? REACTION_LABEL[myReaction] : "Like"}
          </button>
          {showReactionPicker && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowReactionPicker(false)} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 flex gap-1 bg-[var(--paper-raised)] border border-[var(--line)] rounded-full px-2 py-1.5 shadow-lg animate-fade-in-up">
                {(["like", "heart", "angry"] as const).map((type) => (
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
          onAdd={(content) => onAddComment(post.id, content)}
          onEdit={(commentId, content) => onEditComment(post.id, commentId, content)}
          onDelete={(commentId) => onDeleteComment(post.id, commentId)}
        />
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
