"use client";

import { useState } from "react";
import type { Announcement, ReactionType } from "./AnnouncementsFeed";
import { Avatar } from "@/components/ui";
import CommentSection from "@/components/feed/CommentSection";
import type { Mentionable } from "@/components/feed/mentions";

const REACTION_EMOJI: Record<string, string> = {
  like: "👍", heart: "❤️", poop: "💩", roll_eyes: "🙄", angry: "😡",
};
const REACTION_LABEL: Record<string, string> = {
  like: "Like", heart: "Heart", poop: "Poop", roll_eyes: "Roll Eyes", angry: "Angry",
};
const REACTION_ORDER: ReactionType[] = ["like", "heart", "poop", "roll_eyes", "angry"];

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

function toTitleCase(v: string | null | undefined) {
  if (!v) return "";
  return v.toLowerCase().split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export default function AnnouncementCard({
  announcement: ann,
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
  announcement: Announcement;
  userId: string;
  currentUserRole: string;
  mentionable: Mentionable[];
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string, body: string) => void;
  onReact: (id: string, reaction: ReactionType) => void;
  onAddComment: (id: string, content: string) => Promise<void>;
  onEditComment: (annId: string, commentId: string, content: string) => void;
  onDeleteComment: (annId: string, commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(ann.title);
  const [editBody, setEditBody] = useState(ann.body);
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // Which attached image is open full-size, if any.
  const [lightbox, setLightbox] = useState<string | null>(null);

  const isTeamLeader = currentUserRole === "team_leader";
  const wasEdited = ann.updated_at !== ann.created_at;
  const authorFirst = ann.profiles?.first_name ?? "";
  const authorLast = ann.profiles?.last_name ?? "";
  const authorAvatar = ann.profiles?.avatar_url ?? null;

  const reactionCounts: Record<string, number> = {};
  for (const r of ann.announcement_reactions) {
    reactionCounts[r.reaction] = (reactionCounts[r.reaction] || 0) + 1;
  }
  const myReaction = ann.announcement_reactions.find((r) => r.profile_id === userId)?.reaction;
  const totalReactions = ann.announcement_reactions.length;

  function handleSaveEdit() {
    if (!editTitle.trim() || !editBody.trim()) return;
    onEdit(ann.id, editTitle.trim(), editBody.trim());
    setEditing(false);
  }

  return (
    <div
      className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-fade-in-up"
      style={{ boxShadow: "var(--shadow-xs)" }}
    >
      {/* Announcement badge */}
      <div className="px-4 pt-3 pb-0">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          📢 Announcement
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <Avatar firstName={authorFirst} lastName={authorLast} avatarUrl={authorAvatar} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[var(--ink)] truncate">
              {toTitleCase(authorFirst)} {toTitleCase(authorLast)}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              TL
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span>{timeAgo(ann.created_at)}</span>
            {wasEdited && <span>· edited</span>}
          </div>
        </div>

        {isTeamLeader && (
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
                    onClick={() => { setShowMenu(false); setEditTitle(ann.title); setEditBody(ann.body); setEditing(true); }}
                    className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--accent-soft)]/40 text-[var(--ink)] transition-colors"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onDelete(ann.id); }}
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
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={200}
              className="w-full text-[16px] font-bold border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--paper)] text-[var(--ink)] outline-none focus:border-[var(--accent)] transition-colors"
              autoFocus
            />
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              maxLength={5000}
              rows={4}
              className="w-full resize-none bg-[var(--paper)] border border-[var(--line)] rounded-lg px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-[12px] font-bold text-[var(--muted)] hover:text-[var(--ink)] rounded-md hover:bg-[var(--paper)] transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || !editBody.trim()}
                className="px-3 py-1.5 text-[12px] font-bold bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-strong)] disabled:opacity-40 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-[16px] font-bold text-[var(--ink)] m-0 mb-1.5">{ann.title}</h3>
            <p className="text-[14px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap break-words m-0">
              {ann.body}
            </p>

            {/* One image runs full width; several tile two-up. Each opens
                full size, because an announcement image is usually a
                screenshot with text in it that a thumbnail cannot carry. */}
            {(ann.image_urls?.length ?? 0) > 0 && (
              <div
                className={`mt-3 grid gap-2 ${
                  ann.image_urls!.length === 1 ? "grid-cols-1" : "grid-cols-2"
                }`}
              >
                {ann.image_urls!.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setLightbox(src)}
                    className="block rounded-lg overflow-hidden border border-[var(--line)] cursor-zoom-in bg-[var(--paper)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Attachment ${i + 1} of ${ann.title}`}
                      loading="lazy"
                      className={`w-full object-cover ${
                        ann.image_urls!.length === 1 ? "max-h-[420px]" : "aspect-[4/3]"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}

      {/* Reaction summary + comment count */}
      {(totalReactions > 0 || ann.announcement_comments.length > 0) && (
        <div className="flex items-center justify-between px-4 pb-2 text-[12px] text-[var(--muted)]">
          <div className="flex items-center gap-1">
            {totalReactions > 0 && (
              <>
                <span className="flex -space-x-0.5">
                  {Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]).map(([type]) => (
                    <span key={type} className="text-[14px]">{REACTION_EMOJI[type]}</span>
                  ))}
                </span>
                <span className="ml-1">{totalReactions}</span>
              </>
            )}
          </div>
          {ann.announcement_comments.length > 0 && (
            <button type="button" onClick={() => setShowComments(!showComments)} className="hover:underline hover:text-[var(--ink)] transition-colors">
              {ann.announcement_comments.length} comment{ann.announcement_comments.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex border-t border-[var(--line)]">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-bold transition-colors ${
              myReaction ? "text-[var(--accent-strong)] bg-[var(--accent-soft)]/20" : "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
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
                    onClick={() => { setShowReactionPicker(false); onReact(ann.id, type); }}
                    className={`text-[22px] hover:scale-125 active:scale-100 transition-transform px-1 ${myReaction === type ? "scale-110" : ""}`}
                    title={REACTION_LABEL[type]}
                  >
                    {REACTION_EMOJI[type]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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

      {/* Comments — reuses the existing CommentSection from the social feed */}
      {showComments && (
        <CommentSection
          postId={ann.id}
          comments={ann.announcement_comments}
          userId={userId}
          currentUserRole={currentUserRole}
          mentionable={mentionable}
          onAdd={(content) => onAddComment(ann.id, content)}
          onEdit={(commentId, content) => onEditComment(ann.id, commentId, content)}
          onDelete={(commentId) => onDeleteComment(ann.id, commentId)}
        />
      )}
    </div>
  );
}
