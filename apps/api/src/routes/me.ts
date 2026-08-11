import { Hono } from "hono";
import type { AppContext } from "../types";
import { requireAuth } from "../lib/auth";

/**
 * Espace personnel de l'acheteur.
 *
 * Jusqu'ici la table `users` ne contenait que des organisateurs : un billet
 * vivait à `/t/<serial>`, une URL qu'on ne retrouvait que dans un email. Le
 * rattachement se fait sans nouvelle colonne — `tickets.buyer_email` est
 * renseigné sur chaque billet et normalisé en minuscules au checkout, comme
 * `users.email`. Se connecter avec l'adresse d'achat suffit donc à retrouver
 * ses billets.
 */
const me = new Hono<AppContext>();
me.use("*", requireAuth);

interface TicketRow {
  serial: string;
  status: string;
  created_at: string;
  category_name: string;
  price_cents: number;
  currency: string;
  event_title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  public_slug: string;
  logo_media_id: string | null;
  cover_media_id: string | null;
  event_status: string;
}

/** Billets détenus par l'adresse du compte, les prochains d'abord. */
me.get("/tickets", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    `SELECT t.serial, t.status, t.created_at,
            tc.name AS category_name, tc.price_cents, tc.currency,
            e.title AS event_title, e.starts_at, e.ends_at, e.venue, e.address,
            e.public_slug, e.logo_media_id, e.cover_media_id, e.status AS event_status
     FROM tickets t
     JOIN ticket_categories tc ON tc.id = t.category_id
     JOIN events e ON e.id = t.event_id
     WHERE t.buyer_email = ? AND e.status != 'archived'
     ORDER BY e.starts_at DESC`,
  )
    .bind(user.email)
    .all<TicketRow>();

  // Le partage passé/à venir se fait ici plutôt que côté client : c'est la même
  // règle que `eventIsPast` et elle doit rester cohérente entre les deux.
  const now = new Date().toISOString();
  const isPast = (t: TicketRow) => (t.ends_at ?? t.starts_at) < now;

  return c.json({
    upcoming: rows.results.filter((t) => !isPast(t)),
    past: rows.results.filter(isPast),
  });
});

/**
 * Invitations reçues à cette adresse (événements privés), pour que l'espace
 * personnel couvre les deux façons d'être convié à un événement.
 */
me.get("/invitations", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    `SELECT g.token, g.rsvp_status, e.title AS event_title, e.starts_at, e.ends_at,
            e.venue, e.logo_media_id
     FROM guests g JOIN events e ON e.id = g.event_id
     WHERE g.email = ? AND e.status != 'archived'
     ORDER BY e.starts_at DESC`,
  )
    .bind(user.email)
    .all();
  return c.json({ invitations: rows.results });
});

export default me;
