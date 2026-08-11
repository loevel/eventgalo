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
  // Les sujets contiennent des titres d'événement et des noms d'entreprise saisis
  // par les utilisateurs : un retour à la ligne y ouvrirait une injection d'en-tête.
  const safeSubject = subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!env.EMAIL_FROM) {
    console.log(`[email:dev] to=${to} subject=${safeSubject} url=${debugUrl ?? "-"}`);
    return { sent: false, debug_url: debugUrl };
  }
  try {
    await env.EMAIL.send({
      from: env.EMAIL_FROM,
      to,
      subject: safeSubject,
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
 * email. Sans ça, un « < » suffit à casser le rendu du message chez le
 * destinataire — et une balise `<a>` complète permet de faire livrer un lien de
 * phishing par un email authentiquement signé par notre domaine.
 *
 * Règle : toute valeur qui vient de la base ou d'une requête passe par ici avant
 * d'entrer dans un gabarit. Les seules exceptions sont le HTML de mise en forme
 * écrit littéralement dans le code.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Échappe une valeur de type quelconque pour insertion dans un gabarit d'email,
 * avec repli sur un texte neutre quand elle est absente. Raccourci de lisibilité
 * pour les gabarits, qui interpolent beaucoup de champs optionnels.
 */
export function esc(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return escapeHtml(fallback);
  return escapeHtml(String(value));
}

/**
 * Échappe une URL destinée à un attribut `href`. Les schémas autres que http(s)
 * et mailto sont refusés : un `javascript:` ou un `data:` saisi par un sponsor
 * dans son champ « site web » ne doit jamais atterrir dans un lien cliquable.
 */
export function escapeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
  return escapeHtml(url.toString());
}

/**
 * Logo EventGalo affiché en en-tête quand l'événement n'a pas son propre logo.
 * URL absolue et stable (les clients email ne résolvent pas les chemins
 * relatifs) : le domaine public sert la même image en staging comme en prod.
 * Le mot-logo texte reste sous l'image, qui porte donc un alt vide — les
 * clients qui bloquent les images n'affichent aucun trou.
 */
const BRAND_LOGO_URL = "https://eventgalo.com/logo-email.png";

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
  // `title` et `eventTitle` viennent systématiquement de la base (nom d'événement,
  // nom d'entreprise…) : ils sont échappés ici, à la frontière du gabarit, pour
  // qu'aucun appelant n'ait à y penser. `body` reste du HTML de confiance : c'est
  // à l'appelant d'échapper ce qu'il y interpole (voir `esc`).
  const safeTitle = escapeHtml(title);
  const safeEventTitle = opts.eventTitle ? escapeHtml(opts.eventTitle) : null;
  const safeLogoUrl = escapeUrl(opts.logoUrl);
  const header = safeLogoUrl
    ? `<div style="text-align:center;padding:28px 24px 22px;background:#151009;border-radius:14px 14px 0 0">
        <img src="${safeLogoUrl}" alt="${safeEventTitle ?? "Logo de l'organisateur"}" width="72" height="72"
          style="width:72px;height:72px;object-fit:contain;border-radius:12px;background:#ffffff;padding:6px" />
        ${safeEventTitle ? `<p style="margin:12px 0 0;color:#f2c078;font-size:13px;letter-spacing:0.08em;text-transform:uppercase">${safeEventTitle}</p>` : ""}
      </div>`
    : `<div style="text-align:center;padding:22px 24px 18px;background:#151009;border-radius:14px 14px 0 0">
        <img src="${BRAND_LOGO_URL}" alt="" width="44" height="44" style="width:44px;height:44px;display:block;margin:0 auto 10px" />
        <p style="margin:0;color:#f6ede1;font-size:17px;font-family:Georgia,serif">Event<em style="color:#f2c078">Galo</em></p>
        ${safeEventTitle ? `<p style="margin:8px 0 0;color:#f2c078;font-size:13px;letter-spacing:0.08em;text-transform:uppercase">${safeEventTitle}</p>` : ""}
      </div>`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f3ee;padding:24px;margin:0">
  <div style="max-width:520px;margin:0 auto">
    ${header}
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:30px 32px;border:1px solid #eee7db;border-top:none">
      <h1 style="font-size:20px;color:#1c1a17;margin:0 0 14px;font-family:Georgia,serif">${safeTitle}</h1>
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
