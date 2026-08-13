"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ImageCropModal from "./ImageCropModal";

export default function ProfilePhotoFrame({
  firstName,
  lastName,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setError(null);
    // Opens the crop/rotate/zoom editor instead of uploading immediately —
    // the file only gets sent to the server once the user confirms.
    setPendingFile(file);
  }

  async function handleCropped(blob: Blob) {
    setPendingFile(null);
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", blob, "avatar.jpg");
    const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });

    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed.");
      return;
    }

    router.refresh();
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    setUploading(true);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove your photo.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <div
          className="w-[80px] h-[80px] rounded-full overflow-hidden border-[3px] border-[var(--accent)] transition-shadow hover:shadow-md"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`${firstName}'s photo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center text-[26px] font-bold font-serif">
              {initials}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-[10px] font-bold tracking-wide">
            {uploading ? "Working…" : "Change"}
          </span>
        </div>
      </button>
      {avatarUrl && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--bad)]"
        >
          Remove photo
        </button>
      )}
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}

      {pendingFile && (
        <ImageCropModal file={pendingFile} onCancel={() => setPendingFile(null)} onSave={handleCropped} />
      )}
    </div>
  );
}
