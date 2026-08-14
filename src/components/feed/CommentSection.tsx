"use client";

import { useState, useRef, useEffect } from "react";
import { Avatar } from "@/components/ui";
import type { Comment } from "./SocialFeed";
import { useMentionAutocomplete, MentionDropdown, renderTextWithMentions, type Mentionable } from "./mentions";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function toTitleCase(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function CommentItem({
  comment,
  userId,
  currentUserRole,
  mentionable,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  userId: string;
  currentUserRole: string;
  mentionable: Mentionable[];
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editMention = useMentionAutocomplete(mentionable);
  const isAuthor = comment.author_id === userId;
  const isTeamLeader = currentUserRole === "team_leader";
  const wasEdited = comment.updated_at !== comment.created_at;
  // Defensive: profiles can be null in edge cases (deleted/inactive
  // author) — reading .first_name blind used to crash the page.
  const first = comment.profiles?.first_name ?? "";
  const last = comment.profiles?.last_name ?? "";
  const avatar = comment.profiles?.avatar_url ?? null;

  function handleSave() {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    onEdit(comment.id, trimmed);
    setEditing(false);
    editMention.reset();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editMention.handleKeyDown(e, pickMention)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditContent(comment.content);
      editMention.reset();
    }
  }

  function pickMention(name: string) {
    const result = editMention.applyMention(editContent, name);
    if (!result) return;
    setEditContent(result.text);
    editMention.reset();
    requestAnimationFrame(() => {
      const el = editInputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = result.cursor;
    });
  }

  const showEditDropdown = editMention.trigger !== null && editMention.suggestions.length > 0;

  // On touch devices (no hover), always show Edit/Delete actions.
  // On hover-capable devices, show them on mouse-enter only.
  const [hovered, setHovered] = useState(false);
  const isTouchDevice = typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches;
  const actionsVisible = isTouchDevice || hovered;

  return (
    <div
      className="flex gap-2 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="shrink-0 mt-0.5">
        <Avatar firstName={first} lastName={last} avatarUrl={avatar} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-1.5 relative">
            <input
              ref={editInputRef}
              type="text"
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                editMention.onChange(e.target);
              }}
              onKeyDown={handleKeyDown}
              maxLength={1000}
              autoFocus
              className="w-full bg-[var(--paper)] border border-[var(--accent)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--ink)] outline-none"
            />
            {showEditDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10">
                <MentionDropdown suggestions={editMention.suggestions} activeIndex={editMention.activeIndex} onPick={pickMention} />
              </div>
            )}
            <div className="flex gap-1.5 text-[11px]">
              <span className="text-[var(--muted)]">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <div className="bg-[var(--paper)] rounded-xl px-3 py-2 inline-block max-w-full">
            <span className="text-[12.5px] font-bold text-[var(--ink)]">
              {toTitleCase(first)} {toTitleCase(last)}
            </span>
            <p className="text-[13px] text-[var(--ink)] leading-relaxed m-0 whitespace-pre-wrap break-words">
              {renderTextWithMentions(comment.content, mentionable)}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5 px-1">
          <span className="text-[10.5px] text-[var(--muted)]">{timeAgo(comment.created_at)}</span>
          {wasEdited && <span className="text-[10.5px] text-[var(--muted)]">· edited</span>}
          {actionsVisible && !editing && isAuthor && (
            <button
              type="button"
              onClick={() => {
                setEditContent(comment.content);
                setEditing(true);
              }}
              className="text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--accent-strong)] transition-colors"
            >
              Edit
            </button>
          )}
          {actionsVisible && !editing && isTeamLeader && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommentSection({
  postId,
  comments,
  userId,
  currentUserRole,
  mentionable,
  onAdd,
  onEdit,
  onDelete,
}: {
  postId: string;
  comments: Comment[];
  userId: string;
  currentUserRole: string;
  mentionable: Mentionable[];
  onAdd: (content: string) => Promise<void>;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mention = useMentionAutocomplete(mentionable);

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [comments.length]);

  async function handleSubmit() {
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    await onAdd(trimmed);
    setNewComment("");
    mention.reset();
    setSubmitting(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mention.handleKeyDown(e, pickMention)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function pickMention(name: string) {
    const result = mention.applyMention(newComment, name);
    if (!result) return;
    setNewComment(result.text);
    mention.reset();
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = result.cursor;
    });
  }

  const showMentionDropdown = mention.trigger !== null && mention.suggestions.length > 0;

  return (
    <div className="border-t border-[var(--line)] bg-[var(--paper)]/40">
      {/* Comment list */}
      {comments.length > 0 && (
        <div className="px-4 pt-3 space-y-3 max-h-[300px] overflow-y-auto">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} userId={userId} currentUserRole={currentUserRole} mentionable={mentionable} onEdit={onEdit} onDelete={onDelete} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* @mention autocomplete for the new-comment input */}
      {showMentionDropdown && (
        <div className="px-4">
          <MentionDropdown suggestions={mention.suggestions} activeIndex={mention.activeIndex} onPick={pickMention} />
        </div>
      )}

      {/* New comment input */}
      <div className="flex items-center gap-2 px-4 py-3">
        <input
          ref={inputRef}
          type="text"
          value={newComment}
          onChange={(e) => {
            setNewComment(e.target.value);
            mention.onChange(e.target);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment… (@ to mention)"
          maxLength={1000}
          className="flex-1 bg-[var(--paper)] border border-[var(--line)] rounded-full px-4 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!newComment.trim() || submitting}
          className="shrink-0 p-2 rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          {submitting ? (
            <span className="w-4 h-4 block border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
