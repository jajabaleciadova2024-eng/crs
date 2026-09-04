import type { ReactNode } from "react";

// Turns URLs inside plain text into links.
//
// Deliberately NOT dangerouslySetInnerHTML: the text is authored by a Team
// Leader, but building the anchors as React elements means a description
// containing markup is still shown as the characters someone typed rather
// than parsed. Only http(s) and bare www. are linked — a "javascript:" or
// "data:" URL is left as text, so a pasted one can never become clickable.
//
// Trailing punctuation is trimmed back onto the sentence: "see https://x.com."
// should link x.com, not "x.com." — and a closing bracket only belongs to the
// URL if it opened inside it, which is common in wiki-style links.
const URL_RE = /(\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+)/gi;

function trimTrailing(url: string): { href: string; tail: string } {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,;:!?".includes(ch)) {
      end--;
      continue;
    }
    if (ch === ")") {
      const slice = url.slice(0, end);
      const opens = (slice.match(/\(/g) ?? []).length;
      const closes = (slice.match(/\)/g) ?? []).length;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return { href: url.slice(0, end), tail: url.slice(end) };
}

export default function Linkify({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;

  while ((match = URL_RE.exec(text)) !== null) {
    const { href, tail } = trimTrailing(match[0]);
    if (!href) continue;
    if (match.index > last) out.push(text.slice(last, match.index));
    const url = href.startsWith("www.") ? `https://${href}` : href;
    out.push(
      <a
        key={`${match.index}-${href}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        // Opens in a new tab: these sit inside a task someone is part-way
        // through, and taking over the tab loses whatever they were doing.
        onClick={(e) => e.stopPropagation()}
        className="text-[var(--accent-strong)] underline underline-offset-2 hover:opacity-80 break-all"
      >
        {href}
      </a>,
    );
    if (tail) out.push(tail);
    last = match.index + match[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
