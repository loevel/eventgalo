import type { Env } from "../types";

export interface EmailResult {
  sent: boolean;
  debug_url?: string;
}

/**
 * Envoi d'email via Resend si RESEND_API_KEY est configurée.
 * Sinon (dev / pré-lancement) : log console et retour du lien en clair
 * pour que le front puisse l'afficher.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  debugUrl?: string,
): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${to} subject=${subject} url=${debugUrl ?? "-"}`);
    return { sent: false, debug_url: debugUrl };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "EventGalo <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error(`[email] échec Resend ${res.status}: ${await res.text()}`);
    return { sent: false, debug_url: debugUrl };
  }
  return { sent: true };
}

export function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f5f2;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="font-size:20px;color:#1a1a1a">${title}</h1>
    ${body}
    <p style="color:#999;font-size:12px;margin-top:32px">EventGalo — gestion d'événements et billetterie</p>
  </div></body></html>`;
}
