"use client";

import { useState, useRef } from "react";

const MOOD_EMOJIS = [
  "😀", "😂", "🥹", "😍", "🤩", "😎", "🤔", "😤",
  "😭", "🥳", "😴", "🤯", "🫡", "💪", "🔥", "❤️",
  "👏", "🙏", "😅", "🤣", "😊", "🥰", "😇", "🤗",
];

export default function PostComposer({ onSubmit }: { onSubmit: (content: string, imageUrl?: string | null) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    const trimmed = content.trim();
    if ((!trimmed && !imageUrl) || submitting) return;
    setSubmitting(true);
    await onSubmit(trimmed, imageUrl);
    setContent("");
    setImageUrl(null);
    setImagePreview(null);
    setSubmitting(false);
    setFocused(false);
    setShowEmojis(false);
    textareaRef.current?.blur();
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
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

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setImagePreview(localUrl);
    setFocused(true);

    // Upload to server
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/feed/image", { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUploadError(body.error ?? "Upload failed — try again.");
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
  }

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setContent((prev) => prev + emoji);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const newContent = before + emoji + after;
    setContent(newContent);
    // Restore cursor position after the emoji
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
      ta.focus();
    });
  }

  const canPost = (content.trim() || imageUrl) && !submitting && !uploading;

  return (
    <div
      className={`bg-[var(--paper-raised)] border rounded-xl overflow-hidden transition-all duration-200 ${
        focused ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-[var(--line)]"
      }`}
      style={{ boxShadow: focused ? undefined : "var(--shadow-xs)" }}
    >
      <div className="px-4 pt-4 pb-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => !content && !imagePreview && !showEmojis && setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          maxLength={2000}
          rows={1}
          className="w-full resize-none bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] outline-none leading-relaxed"
          style={{ minHeight: "36px" }}
        />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 pb-2 relative">
          <div className="relative inline-block rounded-lg overflow-hidden border border-[var(--line)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Upload preview"
              className="max-h-[200px] max-w-full object-contain"
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-[14px]"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="px-4 pb-2 text-[12px] text-[var(--bad)] font-medium">{uploadError}</div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div className="px-4 pb-2 animate-fade-in-up">
          <div className="bg-[var(--paper)] border border-[var(--line)] rounded-lg p-2 grid grid-cols-8 gap-0.5">
            {MOOD_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="text-[20px] p-1.5 rounded-md hover:bg-[var(--accent-soft)]/40 hover:scale-110 active:scale-100 transition-transform text-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {(focused || content || imagePreview) && (
        <div className="flex items-center justify-between px-4 pb-3 pt-1 animate-fade-in-up">
          <div className="flex items-center gap-1">
            {/* Image upload button */}
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
              className="p-2 rounded-md text-[var(--muted)] hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Add photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>

            {/* Emoji button */}
            <button
              type="button"
              onClick={() => setShowEmojis(!showEmojis)}
              className={`p-2 rounded-md transition-colors ${
                showEmojis
                  ? "text-[var(--accent-strong)] bg-[var(--accent-soft)]/30"
                  : "text-[var(--muted)] hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30"
              }`}
              title="Add emoji"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>

            <span className="text-[11px] text-[var(--muted)] ml-1">
              {content.length > 0 ? `${content.length}/2000` : "Ctrl+Enter to post"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canPost}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12.5px] font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 hover:-translate-y-[0.5px] active:translate-y-0 shadow-sm"
          >
            {submitting ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Posting…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Post
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
