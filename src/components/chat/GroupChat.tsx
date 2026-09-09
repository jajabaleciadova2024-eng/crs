"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toTitleCase } from "@/lib/format";
import { shrinkOneForUpload, readUploadError, NETWORK_ERROR_MESSAGE } from "@/lib/imageUpload";
import ChatMessage from "./ChatMessage";

export type ChatMsg = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  reply_to_id: string | null;
  original_content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profiles: { first_name: string; last_name: string; avatar_url: string | null; role: string } | null;
  chat_reactions: {
    id: string;
    profile_id: string;
    emoji: string;
    profiles: { first_name: string; last_name: string } | null;
  }[];
  reply: {
    id: string;
    author_id: string;
    content: string;
    profiles: { first_name: string; last_name: string } | null;
  } | null;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const POLL_INTERVAL = 5000;

export default function GroupChat({
  userId,
  currentUserRole,
}: {
  userId: string;
  currentUserRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [unread, setUnread] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const shouldAutoScroll = useRef(true);

  const fetchMessages = useCallback(async (before?: string) => {
    try {
      const url = before ? `/api/chat?before=${encodeURIComponent(before)}` : "/api/chat";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const { messages: msgs } = await res.json();
      if (before) {
        setMessages((prev) => [...prev, ...msgs]);
        if (msgs.length < 50) setHasMore(false);
      } else {
        setMessages(msgs);
      }
    } catch (err) {
      console.error("[GroupChat] fetch error:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread", { cache: "no-store" });
      if (!res.ok) return;
      const { count } = await res.json();
      setUnread(count);
    } catch {}
  }, []);

  const markRead = useCallback(async () => {
    setUnread(0);
    await fetch("/api/chat/read", { method: "POST" }).catch(() => {});
  }, []);

  // Fetch unread count on mount + poll
  useEffect(() => {
    fetchUnread();
    const poll = setInterval(fetchUnread, 15000);
    return () => clearInterval(poll);
  }, [fetchUnread]);

  // Fetch messages when chat opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchMessages();
      markRead();
    }
  }, [open, fetchMessages, markRead]);

  // Realtime subscription + polling
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();

    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => fetchMessages(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reactions" },
        () => fetchMessages(),
      )
      .subscribe();
    channelRef.current = channel;

    const poll = setInterval(() => fetchMessages(), POLL_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchMessages();
        markRead();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, fetchMessages, markRead]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (shouldAutoScroll.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Track scroll position for auto-scroll
  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 80;

    // Load more when scrolled to top
    if (scrollTop < 50 && hasMore && !loadingMore && messages.length > 0) {
      const oldest = messages[messages.length - 1];
      if (oldest) {
        setLoadingMore(true);
        fetchMessages(oldest.created_at);
      }
    }
  }

  async function handleSend() {
    const trimmed = content.trim();
    if ((!trimmed && !imageUrl) || sending) return;
    setSending(true);
    shouldAutoScroll.current = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          image_url: imageUrl,
          reply_to_id: replyTo?.id ?? null,
        }),
      });
      if (res.ok) {
        setContent("");
        setReplyTo(null);
        setImageUrl(null);
        setImagePreview(null);
        setUploadError(null);
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
        await fetchMessages();
      }
    } catch (err) {
      console.error("[GroupChat] send error:", err);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be under 5 MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setImagePreview(localUrl);
    setUploading(true);

    const { file: ready, error: tooBig } = await shrinkOneForUpload(file);
    if (tooBig) {
      setUploading(false);
      setUploadError(tooBig);
      setImagePreview(null);
      URL.revokeObjectURL(localUrl);
      return;
    }

    const formData = new FormData();
    formData.append("file", ready);
    let res: Response;
    try {
      res = await fetch("/api/chat/image", { method: "POST", body: formData });
    } catch {
      setUploading(false);
      setUploadError(NETWORK_ERROR_MESSAGE);
      setImagePreview(null);
      URL.revokeObjectURL(localUrl);
      return;
    }
    setUploading(false);

    if (!res.ok) {
      setUploadError(await readUploadError(res, "Upload failed — try again."));
      setImagePreview(null);
      URL.revokeObjectURL(localUrl);
      return;
    }

    const { url } = await res.json();
    setImageUrl(url);
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageUrl(null);
    setImagePreview(null);
    setUploadError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  // Listen for #open-chat from notification bell
  useEffect(() => {
    function onHashChange() {
      if (window.location.hash === "#open-chat") {
        setOpen(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // Reversed for display (newest at bottom)
  const sortedMessages = [...messages].reverse();

  return (
    <>
      {/* Floating chat button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) markRead();
        }}
        aria-label={unread > 0 ? `Team Chat, ${unread} unread` : "Team Chat"}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--bad)] text-[var(--on-accent)] text-[11px] font-bold flex items-center justify-center animate-badge-pulse">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[400px] h-[min(70vh,600px)] bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl overflow-hidden flex flex-col animate-fade-in-up"
          style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--accent)] text-[var(--on-accent)]">
            <div className="flex items-center gap-2.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div>
                <div className="text-[14px] font-bold leading-tight">Team Chat</div>
                <div className="text-[10px] opacity-80">Everyone can see this</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5"
            style={{ overscrollBehavior: "contain" }}
          >
            {loadingMore && (
              <div className="flex justify-center py-2">
                <span className="w-5 h-5 border-2 border-[var(--muted)]/30 border-t-[var(--muted)] rounded-full animate-spin" />
              </div>
            )}
            {hasMore && !loadingMore && messages.length >= 50 && (
              <button
                type="button"
                onClick={() => {
                  const oldest = messages[messages.length - 1];
                  if (oldest) { setLoadingMore(true); fetchMessages(oldest.created_at); }
                }}
                className="w-full text-center text-[11px] text-[var(--muted)] hover:text-[var(--accent-strong)] py-2 cursor-pointer transition-colors"
              >
                Load older messages
              </button>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <span className="w-8 h-8 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                <span className="text-[12px] text-[var(--muted)]">Loading messages…</span>
              </div>
            ) : sortedMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-center">
                <span className="text-[40px]">💬</span>
                <span className="text-[14px] font-bold text-[var(--ink)]">No messages yet</span>
                <span className="text-[12px] text-[var(--muted)]">Be the first to say something!</span>
              </div>
            ) : (
              sortedMessages.map((msg, i) => {
                const prev = i > 0 ? sortedMessages[i - 1] : null;
                const isOwn = msg.author_id === userId;
                const sameSender = prev?.author_id === msg.author_id && !prev?.deleted_at;
                const timeDiff = prev
                  ? (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) / 60000
                  : Infinity;
                const showAvatar = !isOwn && (!sameSender || timeDiff > 3);
                const showName = showAvatar;
                const showTime = timeDiff > 5 || i === 0;

                return (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isOwn={isOwn}
                    userId={userId}
                    currentUserRole={currentUserRole}
                    showAvatar={showAvatar}
                    showName={showName}
                    showTime={showTime}
                    onReply={() => {
                      setReplyTo(msg);
                      textareaRef.current?.focus();
                    }}
                    onReact={async (emoji) => {
                      await fetch(`/api/chat/${msg.id}/react`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ emoji }),
                      });
                      fetchMessages();
                    }}
                    onEdit={async (newContent) => {
                      await fetch(`/api/chat/${msg.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content: newContent }),
                      });
                      fetchMessages();
                    }}
                    onDelete={async () => {
                      await fetch(`/api/chat/${msg.id}`, { method: "DELETE" });
                      fetchMessages();
                    }}
                    reactionEmojis={REACTION_EMOJIS}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply bar */}
          {replyTo && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-soft)]/30 border-t border-[var(--line)]">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-[var(--accent-strong)]">
                  Replying to {toTitleCase(replyTo.profiles?.first_name)}
                </span>
                <p className="text-[11px] text-[var(--muted)] truncate m-0">
                  {replyTo.content || "📷 Image"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="p-1 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Image preview */}
          {imagePreview && (
            <div className="px-4 py-2 border-t border-[var(--line)]">
              <div className="relative inline-block rounded-lg overflow-hidden border border-[var(--line)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Upload preview" className="max-h-[100px] max-w-[150px] object-contain" />
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={removeImage}
                  aria-label="Remove image"
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 text-[12px] cursor-pointer transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {uploadError && (
            <div className="px-4 pb-1 text-[11px] text-[var(--bad)] font-medium">{uploadError}</div>
          )}

          {/* Compose bar */}
          <div className="flex items-end gap-2 px-3 py-2.5 border-t border-[var(--line)] bg-[var(--paper)]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!imageUrl}
              aria-label="Attach image"
              className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              maxLength={2000}
              rows={1}
              className="flex-1 resize-none bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
              style={{ minHeight: "38px", maxHeight: "120px" }}
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={(!content.trim() && !imageUrl) || sending || uploading}
              aria-label="Send message"
              className="p-2 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
            >
              {sending ? (
                <span className="w-[18px] h-[18px] border-2 border-[var(--on-accent)]/30 border-t-[var(--on-accent)] rounded-full animate-spin block" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
