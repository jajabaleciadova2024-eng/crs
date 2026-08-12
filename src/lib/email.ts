import "server-only";
import nodemailer from "nodemailer";

// Two supported send paths, tried in this order:
//  1. SMTP (e.g. a Hostinger mailbox) — set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.
//  2. Resend's REST API — set RESEND_API_KEY.
// Neither set? Sends no-op with a console warning instead of throwing, so
// local dev / a not-yet-configured deploy doesn't crash on every leave
// request or schedule generation.

const RESEND_API_URL = "https://api.resend.com/emails";

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getSmtpTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  if (!smtpTransport) {
    const port = Number(SMTP_PORT) || 465;
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // Hostinger: 465 = SSL, 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return smtpTransport;
}

export async function sendEmail(to: string | string[], subject: string, html: string) {
  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? process.env.SMTP_USER ?? "CRS Naga <onboarding@resend.dev>";

  const smtp = getSmtpTransport();
  if (smtp) {
    try {
      await smtp.sendMail({ from, to, subject, html });
      return { sent: true as const };
    } catch (err) {
      console.error("[email] SMTP send failed:", err);
      return { sent: false, reason: "send_failed" as const };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
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
        console.error(`[email] Resend send failed (${res.status}):`, await res.text());
        return { sent: false, reason: "send_failed" as const };
      }
      return { sent: true as const };
    } catch (err) {
      console.error("[email] Resend send threw:", err);
      return { sent: false, reason: "send_failed" as const };
    }
  }

  console.warn(`[email] No SMTP or RESEND_API_KEY configured — skipping "${subject}" to`, to);
  return { sent: false, reason: "no_api_key" as const };
}
