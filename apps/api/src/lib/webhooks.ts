import type { Env } from "../types";
import { hmacHex, nowIso } from "./crypto";

/** Délai au-delà duquel une livraison est abandonnée (une intégration lente ne doit pas retenir un worker). */
const DELIVERY_TIMEOUT_MS = 5000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
  "metadata.google.internal",
]);

/**
 * Une URL de webhook est fournie par l'organisateur et appelée depuis notre
 * worker : sans contrôle, c'est une sonde authentifiée sortant de notre IP et de
 * notre réputation, dont le résultat lui est renvoyé via `last_status`.
 *
 * On exige donc HTTPS, le port par défaut, et un hôte qui ne soit ni une boucle
 * locale ni une adresse de réseau privé ou de service de métadonnées cloud.
 * Retourne un message d'erreur destiné à l'utilisateur, ou null si l'URL est
 * acceptable.
 */
export function validateWebhookUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "URL invalide";
  }
  if (url.protocol !== "https:") return "L'URL doit commencer par https://";
  if (url.port && url.port !== "443") return "Seul le port 443 (HTTPS standard) est accepté";

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) return "Cette adresse n'est pas joignable depuis EventGalo";

  // IPv4 littérale : on écarte les plages non routables sur Internet.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const isPrivate =
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
    if (isPrivate) return "Cette adresse n'est pas joignable depuis EventGalo";
  }
  // IPv6 : boucle locale, unique-local (fc00::/7) et link-local (fe80::/10).
  if (host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host)) {
    return "Cette adresse n'est pas joignable depuis EventGalo";
  }
  return null;
}

/**
 * Déclenche les webhooks souscrits par l'organisateur pour cet événement.
 * Pas de file de retentative (v1) : une livraison échouée est juste tracée
 * dans last_status, l'organisateur peut vérifier la santé de son intégration
 * mais ne recevra pas de nouvelle tentative automatique.
 */
export async function triggerWebhooks(
  env: Env,
  eventId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT id, url, secret, event_types FROM event_webhooks WHERE event_id = ? AND enabled = 1",
  )
    .bind(eventId)
    .all<{ id: string; url: string; secret: string; event_types: string | null }>();
  if (!rows.results.length) return;

  const targets = rows.results.filter((w) => {
    if (!w.event_types) return true;
    try {
      const types = JSON.parse(w.event_types) as unknown;
      return Array.isArray(types) && types.includes(type);
    } catch {
      return true;
    }
  });
  if (!targets.length) return;

  const payload = JSON.stringify({ type, event_id: eventId, data, sent_at: nowIso() });
  await Promise.all(
    targets.map(async (w) => {
      // Revalidé à l'envoi et pas seulement à l'enregistrement : une URL peut
      // avoir été créée avant l'ajout de ce contrôle.
      if (validateWebhookUrl(w.url)) {
        await env.DB.prepare("UPDATE event_webhooks SET last_triggered_at = ?, last_status = 0 WHERE id = ?")
          .bind(nowIso(), w.id)
          .run();
        return;
      }
      const signature = await hmacHex(w.secret, payload);
      let status: number;
      try {
        const res = await fetch(w.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-EventGalo-Event": type,
            "X-EventGalo-Signature": `sha256=${signature}`,
          },
          body: payload,
          redirect: "manual", // une redirection ramènerait vers une cible non validée
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        status = res.status;
      } catch {
        status = 0; // échec réseau (DNS, timeout, hôte injoignable…)
      }
      await env.DB.prepare("UPDATE event_webhooks SET last_triggered_at = ?, last_status = ? WHERE id = ?")
        .bind(nowIso(), status, w.id)
        .run();
    }),
  );
}
