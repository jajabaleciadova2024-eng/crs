"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Avatar } from "@/components/ui";
import ImageCropModal from "@/components/ImageCropModal";

// Photo upload/remove — moved here from the dashboard header (was too easy
// to accidentally click "Remove photo" right under the greeting). Settings
// is a deliberate destination, so accidental removal isn't a risk here.
export default function ProfilePhotoUpload({
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

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
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

  async function handleRemove() {
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
    <div className="flex items-center gap-4">
      <Avatar firstName={firstName} lastName={lastName} avatarUrl={avatarUrl} size="lg" />

      <div className="flex flex-col gap-2">
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Working…" : avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl && (
            <Button type="button" onClick={handleRemove} disabled={uploading}>
              Remove photo
            </Button>
          )}
        </div>
        {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
      </div>

      {pendingFile && (
        <ImageCropModal file={pendingFile} onCancel={() => setPendingFile(null)} onSave={handleCropped} />
      )}
    </div>
  );
}
