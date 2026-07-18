import type { Env } from "../types";
import { nowIso } from "./crypto";
import { layout, sendEmail } from "./email";

/**
 * Notifie les premiers inscrits sur liste d'attente lorsque des places se libèrent
 * (augmentation de quantité, remboursement). Premier arrivé, premier notifié ;
 * chaque entrée n'est notifiée qu'une seule fois.
 */
export async function notifyWaitlist(env: Env, categoryId: string, freedSlots: number): Promise<void> {
  if (freedSlots <= 0) return;
  const entries = await env.DB.prepare(
    `SELECT w.id, w.name, w.email, c.name AS category_name, e.title AS event_title, e.public_slug, e.logo_media_id
     FROM waitlist w
     JOIN ticket_categories c ON c.id = w.category_id
     JOIN events e ON e.id = c.event_id
     WHERE w.category_id = ? AND w.notified_at IS NULL
     ORDER BY w.created_at ASC LIMIT ?`,
  )
    .bind(categoryId, freedSlots)
    .all<{ id: string; name: string; email: string; category_name: string; event_title: string; public_slug: string; logo_media_id: string | null }>();

  for (const entry of entries.results) {
    const url = `${env.WEB_BASE_URL}/e/${entry.public_slug}`;
    const logoUrl =
      entry.logo_media_id && env.API_BASE_URL
        ? `${env.API_BASE_URL}/api/public/media/${entry.logo_media_id}/file`
        : null;
    await sendEmail(
      env,
      entry.email,
      `Une place s'est libérée — ${entry.event_title}`,
      layout(
        `Bonne nouvelle, ${entry.name} !`,
        `<p>Une place vient de se libérer dans la catégorie <strong>${entry.category_name}</strong> pour <strong>${entry.event_title}</strong>.</p>
         <p>Les places partent vite : <a href="${url}">réservez maintenant</a>.</p>`,
        { logoUrl, eventTitle: entry.event_title },
      ),
      url,
    );
    await env.DB.prepare("UPDATE waitlist SET notified_at = ? WHERE id = ?").bind(nowIso(), entry.id).run();
  }
}
