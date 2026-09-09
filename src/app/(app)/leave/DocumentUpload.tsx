"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, Modal } from "@/components/ui";
import { shrinkOneForUpload, readUploadError, NETWORK_ERROR_MESSAGE } from "@/lib/imageUpload";

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

    // A photographed medical certificate is camera-sized; shrink it so the
    // request fits. Anything that isn't an image (a PDF, most often) is
    // passed through untouched.
    const { file: ready, error: tooBig } = await shrinkOneForUpload(file);
    if (tooBig) {
      setError(tooBig);
      setUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", ready);
    let res: Response;
    try {
      res = await fetch(`/api/leave/${requestId}/document`, { method: "POST", body: formData });
    } catch {
      setUploading(false);
      setError(NETWORK_ERROR_MESSAGE);
      return;
    }
    setUploading(false);

    if (!res.ok) {
      setError(await readUploadError(res, "Upload failed."));
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
        size="sm"
        onClick={() => inputRef.current?.click()}
        loading={uploading}
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
export function DocumentLinks({
  requestId,
  canDownload,
  memberName,
}: {
  requestId: string;
  canDownload: boolean;
  /** Whose request this is — a Team Leader reviewing a queue needs to know
      which document they just opened, same as the task proof viewer. */
  memberName?: string;
}) {
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
      <IconButton
        size="sm"
        tone="accent"
        onClick={openModal}
        disabled={loading}
        label={loading ? "Opening…" : "View document"}
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
      </IconButton>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}

      {links && (
        <Modal size="lg" onClose={() => setLinks(null)} title="Supporting document" className="p-0 sm:p-0 gap-0">
          {(memberName || links.fileName) && (
            <div className="text-[11px] text-[var(--muted)] truncate px-5 -mt-1">
              {memberName ?? links.fileName}
            </div>
          )}
          {canDownload && (
            <div className="flex justify-end px-5 pt-1">
              <a
                href={links.downloadUrl}
                download={links.fileName || undefined}
                title="Download"
                aria-label="Download this document"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--accent-strong)] hover:underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download
              </a>
            </div>
          )}
          <div className="w-full flex items-center justify-center bg-[var(--paper)] min-h-[60vh]">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static asset next/image can optimize
              <img src={links.viewUrl} alt="Supporting document" className="max-w-full max-h-full object-contain" />
            ) : (
              <iframe src={links.viewUrl} title="Supporting document" className="w-full min-h-[60vh] border-0 bg-[var(--paper)]" />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
