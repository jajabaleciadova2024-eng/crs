"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function DocumentUpload({
  requestId,
  hasDocument,
  canDownload,
  canReplace,
}: {
  requestId: string;
  hasDocument: boolean;
  canDownload: boolean;
  // Once a document's uploaded this normally switches to View-only — but
  // while the request is sitting rejected, the associate needs a way back
  // to the upload control too (e.g. the wrong file got uploaded the first
  // time), not just their one shot at it.
  canReplace: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/leave/${requestId}/document`, { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed.");
      return;
    }

    router.refresh();
  }

  if (hasDocument && !canReplace) {
    return <DocumentLinks requestId={requestId} canDownload={canDownload} />;
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      {hasDocument && <DocumentLinks requestId={requestId} canDownload={canDownload} />}
      <input ref={inputRef} type="file" onChange={handleFile} disabled={uploading} className="hidden" />
      <Button
        type="button"
        variant="primary"
        style={{ padding: "5px 10px" }}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Uploading…" : hasDocument ? "Replace" : "Upload"}
      </Button>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}

// Shared by the uploader's own row and anyone with view access to someone
// else's. Only ever shows a "View" button inline (e.g. in the Queue) —
// Download lives inside the popup, and only for the Team Leader
// (`canDownload`); everyone else viewing just sees the document, no
// download link, matching the same signed-link-per-click pattern as
// before (fetched fresh on open since links expire).
export function DocumentLinks({ requestId, canDownload }: { requestId: string; canDownload: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<{ viewUrl: string; downloadUrl: string; fileName: string } | null>(null);

  async function openModal() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/leave/${requestId}/document`);
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't open the document.");
      return;
    }

    setLinks({ viewUrl: body.viewUrl, downloadUrl: body.downloadUrl, fileName: body.fileName ?? "" });
  }

  const isImage = links ? /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(links.fileName) : false;

  return (
    <div className="flex flex-col gap-1 items-start">
      {/* Same 28px square icon button as the Approve/Reject/Delete actions
          in LeaveQueueTable, so the Document and Actions columns read as one
          row of controls instead of a filled pill next to three outlines. */}
      <button
        type="button"
        onClick={openModal}
        disabled={loading}
        title={loading ? "Opening…" : "View document"}
        aria-label={loading ? "Opening document" : "View document"}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--accent-strong)] transition-colors cursor-pointer hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}

      {links && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 z-50 animate-fade-in overflow-y-auto" onClick={() => setLinks(null)}>
          <div
            className="w-full max-w-3xl h-[85vh] bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg flex flex-col overflow-hidden animate-scale-in my-auto"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] shrink-0">
              <h2 className="font-serif text-base text-[var(--ink)] m-0">Supporting document</h2>
              <div className="flex items-center gap-2">
                {canDownload && (
                  <Button variant="primary" style={{ padding: "5px 10px" }} onClick={() => window.open(links.downloadUrl, "_blank", "noreferrer")}>
                    Download
                  </Button>
                )}
                <Button style={{ padding: "5px 10px" }} onClick={() => setLinks(null)}>
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 w-full overflow-hidden flex items-center justify-center bg-[var(--paper)]">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static asset next/image can optimize
                <img src={links.viewUrl} alt="Supporting document" className="max-w-full max-h-full object-contain" />
              ) : (
                <iframe src={links.viewUrl} title="Supporting document" className="w-full h-full border-0 bg-white" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
