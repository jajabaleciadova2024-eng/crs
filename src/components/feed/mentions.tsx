"use client";

import { useMemo, useState } from "react";
import { toTitleCase } from "@/lib/format";

// @mentions are first-name-only by design (Team Leader's ask: keep it
// simple, no picking between two "Johns" — it's a cosmetic/interactive
// flourish for the feed, not a targeted-notification system). Detection
// and rendering both just match "@" + a known active member's first name.

export type Mentionable = { id: string; first_name: string; last_name: string };

// Any text field (textarea or input) that supports selectionStart/value
// can drive this hook.
type FieldLike = { value: string; selectionStart: number | null };

function detectTrigger(text: string, cursor: number): { start: number; query: string } | null {
  const upto = text.slice(0, cursor);
  const atIndex = upto.lastIndexOf("@");
  if (atIndex === -1) return null;
  const between = upto.slice(atIndex + 1);
  if (/\s/.test(between)) return null; // cursor moved past the mention word
  if (atIndex > 0 && !/\s/.test(upto[atIndex - 1])) return null; // must start at word boundary
  return { start: atIndex, query: between };
}

export function useMentionAutocomplete(mentionable: Mentionable[]) {
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // De-duped, title-cased first names, sorted — several people can share
  // a first name, but the mention is cosmetic so we only need the name.
  const names = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const m of mentionable) {
      const name = toTitleCase(m.first_name);
      const key = name.toLowerCase();
      if (name && !seen.has(key)) {
        seen.add(key);
        list.push(name);
      }
    }
    return list.sort((a, b) => a.localeCompare(b));
  }, [mentionable]);

  const suggestions = trigger
    ? names.filter((n) => n.toLowerCase().startsWith(trigger.query.toLowerCase())).slice(0, 6)
    : [];

  function onChange(field: FieldLike) {
    const cursor = field.selectionStart ?? field.value.length;
    const next = detectTrigger(field.value, cursor);
    setTrigger(next);
    setActiveIndex(0);
  }

  function reset() {
    setTrigger(null);
    setActiveIndex(0);
  }

  // Returns the new text + new cursor position after inserting the picked
  // name, or null if there's nothing active to complete.
  function applyMention(text: string, name: string): { text: string; cursor: number } | null {
    if (!trigger) return null;
    const cursor = trigger.start + 1 + trigger.query.length;
    const before = text.slice(0, trigger.start);
    const after = text.slice(cursor);
    const inserted = `@${name} `;
    return { text: before + inserted + after, cursor: before.length + inserted.length };
  }

  // Arrow/Enter/Escape handling shared by both composer + comment inputs.
  // Returns true if the key was consumed (caller should preventDefault and
  // skip its own handling, e.g. Enter-to-submit).
  function handleKeyDown(e: React.KeyboardEvent, onPick: (name: string) => void): boolean {
    if (!trigger || suggestions.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      onPick(suggestions[activeIndex]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      reset();
      return true;
    }
    return false;
  }

  return { trigger, suggestions, activeIndex, setActiveIndex, onChange, reset, applyMention, handleKeyDown };
}

export function MentionDropdown({
  suggestions,
  activeIndex,
  onPick,
}: {
  suggestions: string[];
  activeIndex: number;
  onPick: (name: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mx-4 mb-1.5 bg-[var(--paper)] border border-[var(--line)] rounded-lg shadow-lg overflow-hidden animate-fade-in-up">
      {suggestions.map((name, i) => (
        <button
          key={name}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(name)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors ${
            i === activeIndex ? "bg-[var(--accent-soft)]/50 text-[var(--accent-strong)]" : "text-[var(--ink)] hover:bg-[var(--accent-soft)]/25"
          }`}
        >
          <span className="font-bold">@{name}</span>
        </button>
      ))}
    </div>
  );
}

// Renders post/comment text with any "@Name" that matches a known active
// member's first name highlighted — purely cosmetic, doesn't link to a
// specific person's id (several members can share a first name).
export function renderTextWithMentions(text: string, mentionable: Mentionable[]): React.ReactNode {
  const names = new Set(mentionable.map((m) => toTitleCase(m.first_name).toLowerCase()));
  const parts = text.split(/(@[A-Za-z][A-Za-z'-]*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && names.has(part.slice(1).toLowerCase())) {
      return (
        <span key={i} className="text-[var(--accent-strong)] font-bold">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
