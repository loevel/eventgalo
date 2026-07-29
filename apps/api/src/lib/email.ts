import type { Env } from "../types";

export interface EmailResult {
  sent: boolean;
  debug_url?: string;
}

/**
 * Envoi d'email via le binding Cloudflare Email Sending (env.EMAIL) si
 * EMAIL_FROM est configurée. Sinon (dev / pré-lancement) : log console et
 * retour du lien en clair pour que le front puisse l'afficher.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  debugUrl?: string,
): Promise<EmailResult> {
  if (!env.EMAIL_FROM) {
    console.log(`[email:dev] to=${to} subject=${subject} url=${debugUrl ?? "-"}`);
    return { sent: false, debug_url: debugUrl };
  }
  try {
    await env.EMAIL.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error(`[email] échec Cloudflare Email Sending: ${err}`);
    return { sent: false, debug_url: debugUrl };
  }
}

/**
 * Échappe un texte saisi par un utilisateur avant insertion dans le HTML d'un
 * email (corps d'annonce, message libre…) : sans ça un « < » suffit à casser
 * le rendu du message chez le destinataire.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LayoutOptions {
  /** URL publique du logo de l'association organisatrice, affiché en en-tête. */
  logoUrl?: string | null;
  /** Nom de l'événement, affiché sous le logo dans l'en-tête. */
  eventTitle?: string | null;
}

/**
 * Gabarit d'email « gala » : en-tête sombre avec le logo de l'association
 * (quand l'événement en a un), corps sur carte blanche, pied signé.
 * Doit rester lisible si le client email bloque les images distantes.
 */
export function layout(title: string, body: string, opts: LayoutOptions = {}): string {
  const header = opts.logoUrl
    ? `<div style="text-align:center;padding:28px 24px 22px;background:#151009;border-radius:14px 14px 0 0">
        <img src="${opts.logoUrl}" alt="${opts.eventTitle ?? "Logo de l'organisateur"}" width="72" height="72"
          style="width:72px;height:72px;object-fit:contain;border-radius:12px;background:#ffffff;padding:6px" />
        ${opts.eventTitle ? `<p style="margin:12px 0 0;color:#f2c078;font-size:13px;letter-spacing:0.08em;text-transform:uppercase">${opts.eventTitle}</p>` : ""}
      </div>`
    : `<div style="text-align:center;padding:22px 24px 18px;background:#151009;border-radius:14px 14px 0 0">
        <p style="margin:0;color:#f6ede1;font-size:17px;font-family:Georgia,serif">Event<em style="color:#f2c078">Galo</em></p>
        ${opts.eventTitle ? `<p style="margin:8px 0 0;color:#f2c078;font-size:13px;letter-spacing:0.08em;text-transform:uppercase">${opts.eventTitle}</p>` : ""}
      </div>`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f3ee;padding:24px;margin:0">
  <div style="max-width:520px;margin:0 auto">
    ${header}
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:30px 32px;border:1px solid #eee7db;border-top:none">
      <h1 style="font-size:20px;color:#1c1a17;margin:0 0 14px;font-family:Georgia,serif">${title}</h1>
      ${body}
      <p style="color:#a39c90;font-size:12px;margin:32px 0 0;border-top:1px solid #f0ebe2;padding-top:14px">
        EventGalo — invitations, RSVP et billetterie
      </p>
    </div>
  </div></body></html>`;
}

/** URL publique du logo d'un événement (pour les emails), ou null. */
export async function eventLogoUrl(env: Env, eventId: string): Promise<string | null> {
  if (!env.API_BASE_URL) return null;
  const row = await env.DB.prepare("SELECT logo_media_id FROM events WHERE id = ?")
    .bind(eventId)
    .first<{ logo_media_id: string | null }>();
  if (!row?.logo_media_id) return null;
  return `${env.API_BASE_URL}/api/public/media/${row.logo_media_id}/file`;
}
