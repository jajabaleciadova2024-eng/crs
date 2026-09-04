"use client";

import { useState, useRef, useTransition } from "react";
import { Button } from "@/components/ui";
import { shrinkOneForUpload, readUploadError, NETWORK_ERROR_MESSAGE } from "@/lib/imageUpload";

type UploadedFile = {
  url: string;
  path: string;
  fileName: string;
  fileType: string;
  fileSize: number;
};

export default function TicketComposer({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    setUploading(true);
    setError(null);

    for (let i = 0; i < selected.length; i++) {
      const f = selected[i];
      // Screenshots of the problem are the usual attachment here, and off a
      // phone they exceed what one request may carry. Non-images (a log, a
      // PDF) go up as they are.
      const { file: ready, error: tooBig } = await shrinkOneForUpload(f);
      if (tooBig) {
        setError(`${f.name}: ${tooBig}`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", ready);

      try {
        const res = await fetch("/api/tickets/upload", { method: "POST", body: fd });
        if (!res.ok) {
          setError(await readUploadError(res, `Failed to upload ${f.name}`));
          continue;
        }
        const data = await res.json();
        setFiles((prev) => [...prev, data]);
      } catch {
        setError(`${f.name}: ${NETWORK_ERROR_MESSAGE}`);
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim(),
          attachments: files.map((f) => ({
            file_path: f.url,
            file_name: f.fileName,
            file_type: f.fileType,
            file_size: f.fileSize,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't submit concern.");
        return;
      }

      setSubject("");
      setDescription("");
      setFiles([]);
      setOpen(false);
      onCreated();
    });
  }

  function fileIcon(type: string) {
    if (type.startsWith("image/")) return "🖼️";
    if (type.startsWith("video/")) return "🎬";
    if (type.includes("pdf")) return "📄";
    if (type.includes("word") || type.includes("document")) return "📝";
    if (type.includes("excel") || type.includes("spreadsheet")) return "📊";
    return "📎";
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const INPUT_CLS =
    "w-full text-[13px] border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-colors";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper-raised)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors text-[13.5px]"
      >
        <span className="text-lg">🛡️</span>
        <span>Submit a concern anonymously…</span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in"
      onClick={() => { setOpen(false); setError(null); }}
    >
      <div
        className="w-full max-w-lg bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl p-6 flex flex-col gap-4 animate-scale-in max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🛡️</span>
          <h2 className="font-serif text-xl text-[var(--ink)] m-0">Submit a Concern</h2>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[12px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="font-medium">Your identity will remain completely anonymous</span>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={INPUT_CLS + " mt-1"}
            placeholder="Brief summary of the concern"
            maxLength={200}
            autoFocus
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Description / Report</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLS + " mt-1 min-h-[160px] resize-y"}
            placeholder="Describe the incident in detail…"
            maxLength={10000}
          />
          <span className="text-[10px] text-[var(--muted)] mt-0.5 block text-right">
            {description.length.toLocaleString()} / 10,000
          </span>
        </label>

        {/* Attachments */}
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold block mb-1.5">
            Attachments <span className="normal-case text-[var(--muted)]">(optional)</span>
          </span>

          {files.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-[12px]"
                >
                  <span>{fileIcon(f.fileType)}</span>
                  <span className="flex-1 min-w-0 truncate text-[var(--ink)]">{f.fileName}</span>
                  <span className="text-[var(--muted)] shrink-0">{formatSize(f.fileSize)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-[var(--bad)] hover:text-[var(--bad-strong)] ml-1 shrink-0"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-[12px] px-3 py-1.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "📎 Add files"}
          </button>
          <span className="text-[10px] text-[var(--muted)] ml-2">
            Images, videos, PDFs, Word, Excel — max 25 MB each
          </span>
        </div>

        {error && (
          <p className="text-[12px] text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <Button
            style={{ padding: "7px 14px" }}
            disabled={pending}
            onClick={() => { setOpen(false); setError(null); }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            style={{ padding: "7px 14px" }}
            disabled={pending || !subject.trim() || !description.trim() || uploading}
            onClick={submit}
          >
            {pending ? "Submitting…" : "Submit Anonymously"}
          </Button>
        </div>
      </div>
    </div>
  );
}
