/**
 * Conservation locale d'un billet, pour qu'il reste affichable sans réseau.
 *
 * Le QR est reconstruit côté client à partir de `qr_payload` : il suffit donc
 * de garder la réponse de l'API pour que la page se réaffiche entièrement hors
 * ligne, code-barres compris. Seul le logo de l'organisateur, qui est une
 * requête réseau, manquera — le contrôleur scanne le QR, pas le logo.
 *
 * Le service worker (`public/sw.js`) s'occupe de l'autre moitié du problème :
 * servir le HTML et le JavaScript de la page. Les deux sont nécessaires.
 */

const PREFIX = "eg_ticket:";
/** Au-delà, un billet gardé en local ne correspond plus à rien de vivant. */
const MAX_AGE_MS = 60 * 24 * 3600 * 1000;

interface CachedTicket {
  saved_at: number;
  payload: Record<string, unknown>;
}

export function cacheTicket(serial: string, payload: Record<string, unknown>): void {
  try {
    const entry: CachedTicket = { saved_at: Date.now(), payload };
    localStorage.setItem(PREFIX + serial, JSON.stringify(entry));
  } catch {
    // Navigation privée, quota plein, stockage refusé : on n'a rien à faire de
    // plus. Le billet reste consultable en ligne, comme avant.
  }
}

/** Renvoie le billet conservé, ou `null` s'il est absent, illisible ou périmé. */
export function readCachedTicket(serial: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(PREFIX + serial);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedTicket;
    if (!entry?.payload || typeof entry.saved_at !== "number") return null;
    if (Date.now() - entry.saved_at > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + serial);
      return null;
    }
    return entry.payload;
  } catch {
    return null;
  }
}

/**
 * Installe le service worker qui rend la page elle-même disponible hors ligne.
 *
 * Enregistré depuis `/t/<serial>` avec la portée `/t/` : il ne prend jamais la
 * main sur le reste du site, où un cache agressif ferait plus de mal que de bien.
 */
export function registerTicketWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/t/" }).catch(() => {
    // Contexte non sécurisé, navigation privée, ou utilisateur ayant désactivé
    // la fonctionnalité : le billet reste servi par le réseau.
  });
}
