import type { Env } from "../types";
import { hmacHex, nowIso } from "./crypto";

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
