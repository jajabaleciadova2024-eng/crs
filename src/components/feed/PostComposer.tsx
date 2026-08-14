"use client";

import { useState, useRef } from "react";

export default function PostComposer({ onSubmit }: { onSubmit: (content: string) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    await onSubmit(trimmed);
    setContent("");
    setSubmitting(false);
    setFocused(false);
    textareaRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd + Enter to submit
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

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
          onBlur={() => !content && setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          maxLength={2000}
          rows={1}
          className="w-full resize-none bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] outline-none leading-relaxed"
          style={{ minHeight: "36px" }}
        />
      </div>
      {(focused || content) && (
        <div className="flex items-center justify-between px-4 pb-3 pt-1 animate-fade-in-up">
          <span className="text-[11px] text-[var(--muted)]">
            {content.length > 0 && `${content.length}/2000`}
            {content.length === 0 && "Ctrl+Enter to post"}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
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
