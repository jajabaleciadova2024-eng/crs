import "server-only";
import { google } from "googleapis";
import { Readable } from "node:stream";

// Uploads a leave-request supporting document (medical certificate,
// bereavement proof, etc.) to a shared Google Drive folder via a service
// account. Requires three env vars — see README "Google Drive setup":
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (paste with real newlines or \n-escaped)
//   GOOGLE_DRIVE_FOLDER_ID
// The folder must be shared with the service account (Editor) and set to
// "Anyone with the link — Viewer" so the returned link is actually usable.

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!email || !rawKey || !folderId) {
    return null;
  }

  // Env vars often need the private key's newlines escaped as \n — unescape
  // them back to real newlines if that's how it was pasted.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return { drive: google.drive({ version: "v3", auth }), folderId };
}

export type DriveUploadResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadLeaveDocument(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<DriveUploadResult> {
  const client = getDriveClient();
  if (!client) {
    return { ok: false, error: "Document upload isn't configured yet — ask your Team Leader to set it up." };
  }

  try {
    const { drive, folderId } = client;
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: "id, webViewLink",
    });

    const fileId = res.data.id;
    if (!fileId) {
      return { ok: false, error: "Upload didn't return a file id." };
    }

    // Folder-level sharing should already make this link viewable, but set
    // link-viewable permission on the file itself too as a safety net.
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    return { ok: true, url: res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view` };
  } catch (err) {
    console.error("[googleDrive] upload failed:", err);
    return { ok: false, error: "Couldn't upload the document. Please try again." };
  }
}
