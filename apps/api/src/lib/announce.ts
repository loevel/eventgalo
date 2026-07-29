import type { Env } from "../types";
import { nowIso } from "./crypto";
import { escapeHtml, eventLogoUrl, layout, sendEmail } from "./email";

export interface AnnouncementRecipient {
  email: string;
  /** Lien personnel vers l'invitation (invité) ou le billet (acheteur). */
  url: string;
  kind: "guest" | "ticket";
}

/**
 * Destinataires d'une annonce : les invités qui n'ont pas décliné ET les
 * détenteurs de billets valides ou déjà scannés. Dédoublonné par adresse
 * (insensible à la casse) : une même personne invitée *et* détentrice d'un
 * billet ne reçoit qu'un seul courriel, avec son lien d'invitation.
 */
export async function announcementRecipients(env: Env, eventId: string): Promise<AnnouncementRecipient[]> {
  const [guests, tickets] = await Promise.all([
    env.DB.prepare(
      `SELECT email, token FROM guests
       WHERE event_id = ? AND email IS NOT NULL AND TRIM(email) != '' AND rsvp_status != 'no'
       ORDER BY created_at`,
    )
      .bind(eventId)
      .all<{ email: string; token: string }>(),
    env.DB.prepare(
      `SELECT buyer_email AS email, MIN(serial) AS serial FROM tickets
       WHERE event_id = ? AND status IN ('valid','used') AND TRIM(buyer_email) != ''
       GROUP BY LOWER(TRIM(buyer_email))`,
    )
      .bind(eventId)
      .all<{ email: string; serial: string }>(),
  ]);

  const byEmail = new Map<string, AnnouncementRecipient>();
  for (const g of guests.results) {
    const email = g.email.trim();
    const key = email.toLowerCase();
    if (byEmail.has(key)) continue;
    byEmail.set(key, { email, url: `${env.WEB_BASE_URL}/i/${g.token}`, kind: "guest" });
  }
  for (const t of tickets.results) {
    const email = t.email.trim();
    const key = email.toLowerCase();
    if (byEmail.has(key)) continue;
    byEmail.set(key, { email, url: `${env.WEB_BASE_URL}/t/${t.serial}`, kind: "ticket" });
  }
  return [...byEmail.values()];
}

/**
 * Envoie une annonce à tous les destinataires de l'événement et enregistre la
 * diffusion sur la ligne `announcements` (compteur + horodatage) pour que le
 * tableau de bord puisse l'afficher et proposer un renvoi.
 */
export async function deliverAnnouncement(
  env: Env,
  event: { id: string; title: string },
  announcement: { id: string; body: string },
  known?: AnnouncementRecipient[],
): Promise<{ recipients: number }> {
  const [recipients, logoUrl] = await Promise.all([
    known ?? announcementRecipients(env, event.id),
    eventLogoUrl(env, event.id),
  ]);
  const brand = { logoUrl, eventTitle: event.title };
  const text = escapeHtml(announcement.body);

  for (const r of recipients) {
    await sendEmail(
      env,
      r.email,
      `Mise à jour : ${event.title}`,
      layout(
        `Mise à jour — ${event.title}`,
        `<p style="white-space:pre-wrap">${text}</p>
         <p><a href="${r.url}">${r.kind === "guest" ? "Voir mon invitation" : "Voir mon billet"}</a></p>`,
        brand,
      ),
      r.url,
    );
  }

  await env.DB.prepare("UPDATE announcements SET recipients_count = ?, notified_at = ? WHERE id = ?")
    .bind(recipients.length, nowIso(), announcement.id)
    .run();
  return { recipients: recipients.length };
}
