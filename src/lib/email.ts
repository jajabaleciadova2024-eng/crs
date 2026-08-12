import "server-only";

// Thin wrapper around Resend's REST API (no SDK dependency needed for a
// single "send" call). Requires RESEND_API_KEY as an env var (server-only,
// also needs to be set in Vercel's project settings for prod).
//
// Gracefully no-ops (with a console warning) when the key isn't set, so
// local dev / a not-yet-configured deploy doesn't crash on every leave
// request or schedule generation — it just skips sending.

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(to: string | string[], subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? "CRS Naga <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipping "${subject}" to`, to);
    return { sent: false, reason: "no_api_key" as const };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend send failed (${res.status}):`, body);
      return { sent: false, reason: "send_failed" as const };
    }

    return { sent: true as const };
  } catch (err) {
    console.error("[email] Resend send threw:", err);
    return { sent: false, reason: "send_failed" as const };
  }
}
