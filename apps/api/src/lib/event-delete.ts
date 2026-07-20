import type { Env } from "../types";

export interface DeleteResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Suppression définitive d'un événement et de toutes ses données associées.
 * Refusée si l'événement a des ventes ou des sponsors confirmés : la
 * plateforme n'efface jamais de trace financière, on archive à la place
 * (voir purgeExpiredEvents, qui anonymise plutôt que de supprimer).
 */
export async function deleteEventCascade(env: Env, eventId: string): Promise<DeleteResult> {
  const [paid, sponsored] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM transactions WHERE event_id = ? AND status IN ('paid','refunded')")
      .bind(eventId)
      .first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM sponsors WHERE event_id = ? AND status = 'confirmed'")
      .bind(eventId)
      .first<{ n: number }>(),
  ]);
  if ((paid?.n ?? 0) > 0) {
    return {
      blocked: true,
      reason: "Cet événement a des ventes de billets enregistrées : archivez-le plutôt que de le supprimer, pour conserver l'historique comptable.",
    };
  }
  if ((sponsored?.n ?? 0) > 0) {
    return {
      blocked: true,
      reason: "Cet événement a des sponsors confirmés : archivez-le plutôt que de le supprimer.",
    };
  }

  const media = await env.DB.prepare("SELECT r2_key FROM media WHERE event_id = ?")
    .bind(eventId)
    .all<{ r2_key: string }>();
  if (media.results.length) {
    await env.MEDIA.delete(media.results.map((m) => m.r2_key));
  }

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM refund_requests WHERE transaction_id IN (SELECT id FROM transactions WHERE event_id = ?)",
    ).bind(eventId),
    env.DB.prepare("DELETE FROM tickets WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM transactions WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM ticket_categories WHERE event_id = ?").bind(eventId),
    env.DB.prepare(
      "DELETE FROM seller_quotas WHERE seller_id IN (SELECT id FROM sellers WHERE event_id = ?)",
    ).bind(eventId),
    env.DB.prepare("DELETE FROM sellers WHERE event_id = ?").bind(eventId),
    env.DB.prepare(
      "DELETE FROM sponsor_reviews WHERE sponsor_id IN (SELECT id FROM sponsors WHERE event_id = ?)",
    ).bind(eventId),
    env.DB.prepare("DELETE FROM sponsors WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM sponsor_tiers WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM event_performers WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM event_webhooks WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM announcements WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM waitlist WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM event_collaborators WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM guests WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM media WHERE event_id = ?").bind(eventId),
    env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
  ]);

  return { blocked: false };
}
