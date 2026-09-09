"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, Pill } from "@/components/ui";
import { toTitleCase } from "@/lib/format";
import type { ChatMsg } from "./GroupChat";
import Linkify from "@/components/Linkify";

const ROLE_LABEL: Record<string, string> = {
  team_leader: "TL",
  oic: "OIC",
  associate: "Member",
};
const ROLE_TONE: Record<string, "warn" | "accent" | "muted"> = {
  team_leader: "warn",
  oic: "accent",
  associate: "muted",
};

function timeStr(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function dateStr(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function ChatMessage({
  message: msg,
  isOwn,
  userId,
  currentUserRole,
  showAvatar,
  showName,
  showTime,
  onReply,
  onReact,
  onEdit,
  onDelete,
  reactionEmojis,
}: {
  message: ChatMsg;
  isOwn: boolean;
  userId: string;
  currentUserRole: string;
  showAvatar: boolean;
  showName: boolean;
  showTime: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
  reactionEmojis: string[];
}) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [showReactors, setShowReactors] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const closeActions = useCallback(() => {
    setShowActions(false);
    setShowReactions(false);
  }, []);

  useEffect(() => {
    if (!showActions) return;
    const onClick = (e: MouseEvent) => {
      if (!actionsRef.current?.contains(e.target as Node)) closeActions();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showActions, closeActions]);

  const isDeleted = !!msg.deleted_at;
  const isEdited = msg.original_content !== null && msg.original_content !== msg.content;
  const role = msg.profiles?.role ?? "associate";
  const firstName = toTitleCase(msg.profiles?.first_name);
  const lastName = toTitleCase(msg.profiles?.last_name);
  const isTL = currentUserRole === "team_leader";

  // Group reactions by emoji
  const reactionGroups: Record<string, { count: number; names: string[]; hasMine: boolean }> = {};
  for (const r of msg.chat_reactions) {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { count: 0, names: [], hasMine: false };
    reactionGroups[r.emoji].count++;
    const name = toTitleCase(r.profiles?.first_name) + " " + toTitleCase(r.profiles?.last_name);
    reactionGroups[r.emoji].names.push(name);
    if (r.profile_id === userId) reactionGroups[r.emoji].hasMine = true;
  }

  if (isDeleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${showTime ? "mt-4" : "mt-0.5"}`}>
        {showTime && (
          <div className="absolute left-0 right-0 -top-5 text-center">
            <span className="text-[10px] text-[var(--muted)] bg-[var(--paper)] px-2 py-0.5 rounded-full">
              {dateStr(msg.created_at)} {timeStr(msg.created_at)}
            </span>
          </div>
        )}
        <div className={`flex items-end gap-2 max-w-[80%] ${isOwn ? "flex-row-reverse" : ""}`}>
          {!isOwn && showAvatar && <div className="w-7" />}
          <div className="px-3 py-1.5 rounded-xl bg-[var(--paper)] border border-dashed border-[var(--line)]">
            <span className="text-[12px] italic text-[var(--muted)]">🗑️ Message deleted by Team Leader</span>
          </div>
        </div>
      </div>
    );
  }

  function handleSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    onEdit(trimmed);
    setEditing(false);
  }

  return (
    <div className={`relative group ${showTime ? "mt-4" : "mt-0.5"}`}>
      {/* Time separator */}
      {showTime && (
        <div className="flex justify-center mb-2">
          <span className="text-[10px] text-[var(--muted)] bg-[var(--paper)] px-2.5 py-0.5 rounded-full border border-[var(--line)]">
            {dateStr(msg.created_at)} {timeStr(msg.created_at)}
          </span>
        </div>
      )}

      <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
        <div className={`flex items-end gap-1.5 max-w-[80%] ${isOwn ? "flex-row-reverse" : ""}`}>
          {/* Avatar */}
          {!isOwn && (
            <div className="w-7 shrink-0">
              {showAvatar && (
                <Avatar
                  firstName={msg.profiles?.first_name ?? ""}
                  lastName={msg.profiles?.last_name ?? ""}
                  avatarUrl={msg.profiles?.avatar_url ?? null}
                  size="xs"
                />
              )}
            </div>
          )}

          <div className={`min-w-0 ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
            {/* Name + role */}
            {showName && !isOwn && (
              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                <span className="text-[11px] font-bold text-[var(--ink)]">
                  {firstName} {lastName}
                </span>
                <Pill tone={ROLE_TONE[role] ?? "muted"} size="xs" dot={false}>
                  {ROLE_LABEL[role] ?? role}
                </Pill>
              </div>
            )}

            {/* Reply preview */}
            {msg.reply && (
              <div className={`mb-1 px-2.5 py-1.5 rounded-lg bg-[var(--paper)] border-l-2 border-[var(--accent)] max-w-full ${isOwn ? "ml-auto" : ""}`}>
                <span className="text-[10px] font-bold text-[var(--accent-strong)] block">
                  {toTitleCase(msg.reply.profiles?.first_name)} {toTitleCase(msg.reply.profiles?.last_name)}
                </span>
                <span className="text-[11px] text-[var(--muted)] line-clamp-1 block">
                  {msg.reply.content || "📷 Image"}
                </span>
              </div>
            )}

            {/* Message bubble */}
            <div
              ref={actionsRef}
              className={`relative rounded-2xl px-3 py-2 break-words ${
                isOwn
                  ? "bg-[var(--accent)] text-[var(--on-accent)] rounded-br-md"
                  : "bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] rounded-bl-md"
              }`}
            >
              {editing ? (
                <div className="flex flex-col gap-1.5 min-w-[200px]">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    autoFocus
                    className="w-full resize-none bg-transparent text-[13px] outline-none leading-relaxed"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                      if (e.key === "Escape") setEditing(false);
                    }}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button type="button" onClick={() => setEditing(false)} className="text-[10px] px-2 py-0.5 rounded-md hover:bg-white/20 cursor-pointer transition-colors">Cancel</button>
                    <button type="button" onClick={handleSaveEdit} className="text-[10px] px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 font-bold cursor-pointer transition-colors">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {msg.image_url && (
                    <div className="mb-1.5 -mx-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.image_url}
                        alt="Shared image"
                        className="rounded-lg max-h-[200px] max-w-full object-contain cursor-pointer"
                        loading="lazy"
                      />
                    </div>
                  )}
                  {msg.content && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap m-0">
                      <Linkify text={msg.content} />
                    </p>
                  )}
                  {isEdited && (
                    <button
                      type="button"
                      onClick={() => setShowOriginal(!showOriginal)}
                      className={`text-[9px] mt-0.5 cursor-pointer transition-colors ${
                        isOwn ? "text-[var(--on-accent)]/60 hover:text-[var(--on-accent)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      edited {showOriginal ? "▲" : "▼"}
                    </button>
                  )}
                  {showOriginal && msg.original_content && (
                    <div className={`mt-1 pt-1 border-t text-[11px] italic ${
                      isOwn ? "border-[var(--on-accent)]/20 text-[var(--on-accent)]/70" : "border-[var(--line)] text-[var(--muted)]"
                    }`}>
                      <span className="font-bold">Original:</span> {msg.original_content}
                    </div>
                  )}
                </>
              )}

              {/* Hover action menu */}
              {!editing && (
                <div className={`absolute ${isOwn ? "-left-1 -translate-x-full" : "-right-1 translate-x-full"} top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-10`}>
                  <button
                    type="button"
                    onClick={() => setShowReactions(!showReactions)}
                    title="React"
                    className="w-6 h-6 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--accent-strong)] flex items-center justify-center text-[12px] cursor-pointer transition-colors"
                    style={{ boxShadow: "var(--shadow-xs)" }}
                  >
                    😊
                  </button>
                  <button
                    type="button"
                    onClick={onReply}
                    title="Reply"
                    className="w-6 h-6 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--accent-strong)] flex items-center justify-center cursor-pointer transition-colors"
                    style={{ boxShadow: "var(--shadow-xs)" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 17 4 12 9 7" />
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                    </svg>
                  </button>
                  {isOwn && (
                    <button
                      type="button"
                      onClick={() => { setEditContent(msg.content); setEditing(true); }}
                      title="Edit"
                      className="w-6 h-6 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--accent-strong)] flex items-center justify-center cursor-pointer transition-colors"
                      style={{ boxShadow: "var(--shadow-xs)" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}
                  {isTL && (
                    <button
                      type="button"
                      onClick={onDelete}
                      title="Delete"
                      className="w-6 h-6 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bad)] flex items-center justify-center cursor-pointer transition-colors"
                      style={{ boxShadow: "var(--shadow-xs)" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M19 6l-1.5 14a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Reaction picker */}
              {showReactions && (
                <div className={`absolute ${isOwn ? "right-0" : "left-0"} -top-10 z-20 flex gap-0.5 bg-[var(--paper-raised)] border border-[var(--line)] rounded-full px-1 py-1 animate-fade-in-up`}
                  style={{ boxShadow: "var(--shadow-md)" }}>
                  {reactionEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { onReact(emoji); setShowReactions(false); }}
                      className="text-[18px] hover:scale-125 active:scale-100 transition-transform px-0.5 cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reactions display */}
            {Object.keys(reactionGroups).length > 0 && (
              <div className={`flex flex-wrap gap-1 mt-0.5 px-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                {Object.entries(reactionGroups).map(([emoji, { count, names, hasMine }]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(emoji)}
                    onMouseEnter={() => setShowReactors(emoji)}
                    onMouseLeave={() => setShowReactors(null)}
                    className={`relative inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border cursor-pointer transition-colors ${
                      hasMine
                        ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-strong)]"
                        : "bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                    }`}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span className="font-bold">{count}</span>}
                    {showReactors === emoji && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 bg-[var(--ink)] text-[var(--paper)] text-[10px] px-2 py-1 rounded-md whitespace-nowrap"
                        style={{ boxShadow: "var(--shadow-sm)" }}>
                        {names.join(", ")}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Timestamp on own messages (no avatar) */}
            {!showTime && isOwn && showAvatar && (
              <span className="text-[9px] text-[var(--muted)] px-1 mt-0.5">{timeStr(msg.created_at)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
