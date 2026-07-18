import { Hono } from "hono";
import Stripe from "stripe";
import type { AppContext } from "../types";
import { buildTicketPayload, nowIso, uuid, verifyTicketPayload } from "../lib/crypto";
import { layout, sendEmail } from "../lib/email";
import { MAX_MEDIA_PER_EVENT, MAX_MEDIA_PER_GUEST, MEDIA_LIST_QUERY, validateMediaFile } from "../lib/media";
import { callEventDO, DOError } from "../do/event-do";
import { clientIp, isRateLimited, tooManyRequests } from "../lib/rate-limit";
import { buildIcsEvent, icsResponse } from "../lib/ics";

const pub = new Hono<AppContext>();

const PUBLIC_EVENT_FIELDS = `id, title, description, starts_at, ends_at, venue, address,
  dress_code, capacity, public_slug, type, status, refund_policy, rsvp_question, cover_media_id`;

/* ---------------------------- Page publique ------------------------------ */

// Liste des événements publiés (slug + date de mise à jour) — utilisée par le sitemap du site web
pub.get("/events", async (c) => {
  const events = await c.env.DB.prepare(
    "SELECT public_slug, updated_at FROM events WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1000",
  ).all();
  return c.json({ events: events.results });
});

pub.get("/events/:slug", async (c) => {
  const event = await c.env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_FIELDS} FROM events WHERE public_slug = ? AND status = 'published'`,
  )
    .bind(c.req.param("slug"))
    .first();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const [categories, announcements] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, name, description, perks, price_cents, currency, quantity, sold FROM ticket_categories WHERE event_id = ? ORDER BY price_cents",
    ).bind(event.id).all(),
    c.env.DB.prepare("SELECT body, created_at FROM announcements WHERE event_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(event.id).all(),
  ]);
  return c.json({ event, categories: categories.results, announcements: announcements.results });
});

pub.get("/events/:slug/ics", async (c) => {
  const event = await c.env.DB.prepare(
    `SELECT id, title, description, starts_at, ends_at, venue, address, public_slug
     FROM events WHERE public_slug = ? AND status = 'published'`,
  )
    .bind(c.req.param("slug"))
    .first<{
      id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
      venue: string | null; address: string | null; public_slug: string;
    }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const ics = buildIcsEvent({
    uid: event.id,
    title: event.title,
    description: event.description,
    location: [event.venue, event.address].filter(Boolean).join(", ") || null,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    url: `https://eventgalo.com/e/${event.public_slug}`,
  });
  return icsResponse(ics, event.public_slug);
});

/* --------------------------- Invitation / RSVP --------------------------- */

pub.get("/invite/:token", async (c) => {
  const guest = await c.env.DB.prepare("SELECT * FROM guests WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string; opened_at: string | null }>();
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  if (!guest.opened_at) {
    await c.env.DB.prepare("UPDATE guests SET opened_at = ? WHERE id = ?").bind(nowIso(), guest.id).run();
  }
  const event = await c.env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_FIELDS}, seating_plan FROM events WHERE id = ? AND status != 'archived'`,
  )
    .bind(guest.event_id)
    .first();
  if (!event) return c.json({ error: "Événement archivé" }, 410);
  const announcements = await c.env.DB.prepare(
    "SELECT body, created_at FROM announcements WHERE event_id = ? ORDER BY created_at DESC LIMIT 20",
  ).bind(guest.event_id).all();
  return c.json({ guest, event, announcements: announcements.results });
});

pub.get("/invite/:token/ics", async (c) => {
  const guest = await c.env.DB.prepare("SELECT event_id FROM guests WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ event_id: string }>();
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  const event = await c.env.DB.prepare(
    `SELECT id, title, description, starts_at, ends_at, venue, address, public_slug
     FROM events WHERE id = ? AND status != 'archived'`,
  )
    .bind(guest.event_id)
    .first<{
      id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
      venue: string | null; address: string | null; public_slug: string;
    }>();
  if (!event) return c.json({ error: "Événement archivé" }, 410);
  const ics = buildIcsEvent({
    uid: event.id,
    title: event.title,
    description: event.description,
    location: [event.venue, event.address].filter(Boolean).join(", ") || null,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    url: `https://eventgalo.com/e/${event.public_slug}`,
  });
  return icsResponse(ics, event.public_slug);
});

// Permet à l'invité de corriger ses propres coordonnées (nom, email, téléphone).
pub.patch("/invite/:token", async (c) => {
  if (await isRateLimited(c.env, "invite-edit", clientIp(c), 20, 60)) return tooManyRequests(c);
  const token = c.req.param("token");
  const existing = await c.env.DB.prepare("SELECT id FROM guests WHERE token = ?").bind(token).first<{ id: string }>();
  if (!existing) return c.json({ error: "Invitation introuvable" }, 404);

  const b = await c.req.json<{ name?: string; email?: string | null; phone?: string | null }>().catch(() => ({}) as Record<string, never>);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return c.json({ error: "Le nom ne peut pas être vide" }, 400);
    sets.push("name = ?");
    values.push(name);
  }
  if (b.email !== undefined) {
    const email = b.email ? String(b.email).trim().toLowerCase() : "";
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Adresse email invalide" }, 400);
    sets.push("email = ?");
    values.push(email || null);
  }
  if (b.phone !== undefined) {
    sets.push("phone = ?");
    values.push(b.phone ? String(b.phone).trim() : null);
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  values.push(token);
  await c.env.DB.prepare(`UPDATE guests SET ${sets.join(", ")} WHERE token = ?`).bind(...values).run();
  const guest = await c.env.DB.prepare("SELECT * FROM guests WHERE token = ?").bind(token).first();
  return c.json({ guest });
});

pub.post("/invite/:token/rsvp", async (c) => {
  // 20 requêtes / min par IP : un lien peut être partagé en famille, on reste généreux.
  if (await isRateLimited(c.env, "rsvp", clientIp(c), 20, 60)) return tooManyRequests(c);
  const b = await c.req.json<{ status?: string; consent?: boolean; note?: string }>().catch(() => ({}) as Record<string, never>);
  if (b.status !== "yes" && b.status !== "no") return c.json({ error: "Statut invalide" }, 400);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : undefined;
  const res = await c.env.DB.prepare(
    `UPDATE guests SET rsvp_status = ?, rsvp_at = ?, consent_at = COALESCE(consent_at, ?)
     ${note !== undefined ? ", rsvp_note = ?" : ""}
     WHERE token = ?`,
  )
    .bind(
      ...(note !== undefined
        ? [b.status, nowIso(), b.consent ? nowIso() : null, note || null, c.req.param("token")]
        : [b.status, nowIso(), b.consent ? nowIso() : null, c.req.param("token")]),
    )
    .run();
  if (res.meta.changes === 0) return c.json({ error: "Invitation introuvable" }, 404);
  return c.json({ ok: true, status: b.status });
});

/* ------------------------------ Photos (média) ---------------------------- */

async function getGuestByToken(env: AppContext["Bindings"], token: string) {
  return env.DB.prepare(
    `SELECT g.id, g.event_id, e.status AS event_status
     FROM guests g JOIN events e ON e.id = g.event_id
     WHERE g.token = ?`,
  )
    .bind(token)
    .first<{ id: string; event_id: string; event_status: string }>();
}

pub.post("/invite/:token/media", async (c) => {
  const guest = await getGuestByToken(c.env, c.req.param("token"));
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  if (guest.event_status === "archived") return c.json({ error: "Événement archivé" }, 410);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);

  const [byGuest, byEvent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE guest_id = ?").bind(guest.id).first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE event_id = ?").bind(guest.event_id).first<{ n: number }>(),
  ]);
  if ((byGuest?.n ?? 0) >= MAX_MEDIA_PER_GUEST) {
    return c.json({ error: `Limite de ${MAX_MEDIA_PER_GUEST} photos atteinte` }, 409);
  }
  if ((byEvent?.n ?? 0) >= MAX_MEDIA_PER_EVENT) {
    return c.json({ error: "La galerie de cet événement est pleine" }, 409);
  }

  const id = uuid();
  const key = `events/${guest.event_id}/${id}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare(
    "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, guest.event_id, guest.id, key, file.type)
    .run();
  return c.json({ media: { id, guest_id: guest.id, content_type: file.type } }, 201);
});

pub.get("/invite/:token/media", async (c) => {
  const guest = await getGuestByToken(c.env, c.req.param("token"));
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  const rows = await c.env.DB.prepare(MEDIA_LIST_QUERY).bind(guest.event_id).all();
  return c.json({ media: rows.results, guest_id: guest.id });
});

pub.delete("/invite/:token/media/:mid", async (c) => {
  const guest = await getGuestByToken(c.env, c.req.param("token"));
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  const media = await c.env.DB.prepare("SELECT id, r2_key FROM media WHERE id = ? AND guest_id = ?")
    .bind(c.req.param("mid"), guest.id)
    .first<{ id: string; r2_key: string }>();
  if (!media) return c.json({ error: "Photo introuvable" }, 404);
  await c.env.MEDIA.delete(media.r2_key);
  await c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(media.id).run();
  return c.json({ ok: true });
});

/** Sert le fichier depuis R2 (id UUID non devinable, même modèle que les tokens). */
pub.get("/media/:id/file", async (c) => {
  const media = await c.env.DB.prepare("SELECT r2_key, content_type FROM media WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string; content_type: string }>();
  if (!media) return c.json({ error: "Photo introuvable" }, 404);
  const obj = await c.env.MEDIA.get(media.r2_key);
  if (!obj) return c.json({ error: "Photo introuvable" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": media.content_type,
      "Cache-Control": "private, max-age=3600",
      ETag: obj.httpEtag,
    },
  });
});

/* --------------------------------- Vendeur -------------------------------- */

pub.get("/seller/:code", async (c) => {
  const seller = await c.env.DB.prepare("SELECT id, event_id, name, code FROM sellers WHERE code = ?")
    .bind(c.req.param("code"))
    .first<{ id: string; event_id: string; name: string; code: string }>();
  if (!seller) return c.json({ error: "Code vendeur introuvable" }, 404);
  const event = await c.env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_FIELDS} FROM events WHERE id = ? AND status != 'archived'`,
  ).bind(seller.event_id).first();
  if (!event) return c.json({ error: "Événement archivé" }, 410);
  const categories = await c.env.DB.prepare(
    `SELECT tc.id, tc.name, tc.perks, tc.price_cents, tc.currency, tc.quantity, tc.sold,
            q.quota, q.sold AS seller_sold
     FROM ticket_categories tc
     LEFT JOIN seller_quotas q ON q.category_id = tc.id AND q.seller_id = ?
     WHERE tc.event_id = ? ORDER BY tc.price_cents`,
  ).bind(seller.id, seller.event_id).all();
  return c.json({ seller: { name: seller.name, code: seller.code }, event, categories: categories.results });
});

/** Tableau de bord vendeur : uniquement SES ventes (cloisonnement des données). */
pub.get("/seller/:code/stats", async (c) => {
  const seller = await c.env.DB.prepare("SELECT id, event_id, name FROM sellers WHERE code = ?")
    .bind(c.req.param("code"))
    .first<{ id: string; event_id: string; name: string }>();
  if (!seller) return c.json({ error: "Code vendeur introuvable" }, 404);
  const [quotas, mySales] = await Promise.all([
    c.env.DB.prepare(
      `SELECT q.quota, q.sold, tc.name AS category_name, tc.price_cents, tc.currency
       FROM seller_quotas q JOIN ticket_categories tc ON tc.id = q.category_id
       WHERE q.seller_id = ?`,
    ).bind(seller.id).all(),
    c.env.DB.prepare(
      `SELECT t.serial, t.buyer_name, t.status, tc.name AS category_name, t.created_at
       FROM tickets t JOIN ticket_categories tc ON tc.id = t.category_id
       WHERE t.seller_id = ? ORDER BY t.created_at DESC`,
    ).bind(seller.id).all(),
  ]);
  return c.json({ seller: { name: seller.name }, quotas: quotas.results, sales: mySales.results });
});

/* -------------------------------- Checkout -------------------------------- */

pub.post("/checkout", async (c) => {
  // 10 requêtes / min par IP : limite les tentatives d'épuisement de quota ou de fraude.
  if (await isRateLimited(c.env, "checkout", clientIp(c), 10, 60)) return tooManyRequests(c);
  const b = await c.req
    .json<{
      slug?: string; category_id?: string; quantity?: number;
      buyer_name?: string; buyer_email?: string; seller_code?: string; consent?: boolean;
    }>()
    .catch(() => ({}) as Record<string, never>);
  const buyerName = String(b.buyer_name ?? "").trim();
  const buyerEmail = String(b.buyer_email ?? "").trim().toLowerCase();
  if (!buyerName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
    return c.json({ error: "Nom et email de l'acheteur requis" }, 400);
  }
  if (!b.consent) return c.json({ error: "Le consentement à la collecte des données est requis" }, 400);

  const event = await c.env.DB.prepare(
    "SELECT id, title, public_slug FROM events WHERE public_slug = ? AND status = 'published'",
  )
    .bind(b.slug ?? "")
    .first<{ id: string; title: string; public_slug: string }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);

  // Réservation atomique via le Durable Object de l'événement
  let reservation: { transaction_id: string; amount_cents: number; currency: string };
  try {
    reservation = await callEventDO(c.env, event.id, {
      action: "reserve",
      event_id: event.id,
      category_id: String(b.category_id ?? ""),
      seller_code: b.seller_code || undefined,
      quantity: Number(b.quantity ?? 1) | 0,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      consent: true,
    });
  } catch (e) {
    if (e instanceof DOError) return c.json({ error: e.message }, 409);
    throw e;
  }

  // Paiement Stripe si configuré et montant > 0 ; sinon émission directe
  if (c.env.STRIPE_SECRET_KEY && reservation.amount_cents > 0) {
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    const cat = await c.env.DB.prepare("SELECT name FROM ticket_categories WHERE id = ?")
      .bind(b.category_id)
      .first<{ name: string }>();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [
        {
          quantity: Number(b.quantity ?? 1) | 0,
          price_data: {
            currency: reservation.currency.toLowerCase(),
            unit_amount: reservation.amount_cents / (Number(b.quantity ?? 1) | 0),
            product_data: { name: `${event.title} — ${cat?.name ?? "Billet"}` },
          },
        },
      ],
      metadata: { transaction_id: reservation.transaction_id, event_id: event.id },
      success_url: `${c.env.WEB_BASE_URL}/checkout/success?tx=${reservation.transaction_id}`,
      cancel_url: `${c.env.WEB_BASE_URL}/e/${event.public_slug}?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    await c.env.DB.prepare("UPDATE transactions SET stripe_session_id = ? WHERE id = ?")
      .bind(session.id, reservation.transaction_id)
      .run();
    return c.json({ mode: "stripe", checkout_url: session.url });
  }

  // Pas de Stripe configuré ou billet gratuit : émission immédiate
  const result = await callEventDO<{ tickets: Array<{ id: string; serial: string }> }>(c.env, event.id, {
    action: "finalize",
    transaction_id: reservation.transaction_id,
  });
  c.executionCtx.waitUntil(sendTicketsEmail(c.env, buyerEmail, buyerName, event.title, result.tickets));
  return c.json({
    mode: "direct",
    transaction_id: reservation.transaction_id,
    tickets: result.tickets.map((t) => ({ serial: t.serial, url: `${c.env.WEB_BASE_URL}/t/${t.serial}` })),
  });
});

/* ------------------------------ Liste d'attente ---------------------------- */

pub.post("/waitlist", async (c) => {
  // 10 requêtes / min par IP : dissuade le spam sur ce formulaire public.
  if (await isRateLimited(c.env, "waitlist", clientIp(c), 10, 60)) return tooManyRequests(c);
  const b = await c.req
    .json<{ category_id?: string; name?: string; email?: string; phone?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "Nom et email requis" }, 400);
  }
  const cat = await c.env.DB.prepare(
    `SELECT c.id, c.event_id, c.quantity, c.sold FROM ticket_categories c
     JOIN events e ON e.id = c.event_id WHERE c.id = ? AND e.status = 'published'`,
  )
    .bind(String(b.category_id ?? ""))
    .first<{ id: string; event_id: string; quantity: number; sold: number }>();
  if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
  if (cat.quantity - cat.sold > 0) return c.json({ error: "Cette catégorie n'est pas épuisée" }, 409);

  await c.env.DB.prepare(
    "INSERT INTO waitlist (id, event_id, category_id, name, email, phone) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(uuid(), cat.event_id, cat.id, name, email, (b.phone as string) || null)
    .run();
  return c.json({ ok: true }, 201);
});

export async function sendTicketsEmail(
  env: AppContext["Bindings"],
  email: string,
  name: string,
  eventTitle: string,
  tickets: Array<{ serial: string }>,
) {
  const links = tickets
    .map((t) => `<p><a href="${env.WEB_BASE_URL}/t/${t.serial}">Billet ${t.serial}</a></p>`)
    .join("");
  await sendEmail(
    env,
    email,
    `Vos billets — ${eventTitle}`,
    layout(
      `Merci ${name} !`,
      `<p>Voici vos billets pour <strong>${eventTitle}</strong>. Présentez le QR code à l'entrée.</p>${links}`,
    ),
    tickets[0] ? `${env.WEB_BASE_URL}/t/${tickets[0].serial}` : undefined,
  );
}

/* ------------------------------ Transaction ------------------------------- */

pub.get("/transactions/:id", async (c) => {
  const tx = await c.env.DB.prepare(
    `SELECT tr.id, tr.status, tr.quantity, tr.amount_cents, tr.currency,
            e.title AS event_title, e.public_slug
     FROM transactions tr JOIN events e ON e.id = tr.event_id
     WHERE tr.id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; status: string; [k: string]: unknown }>();
  if (!tx) return c.json({ error: "Transaction introuvable" }, 404);
  let tickets: Array<{ serial: string; url: string }> = [];
  if (tx.status === "paid") {
    const rows = await c.env.DB.prepare(
      "SELECT serial FROM tickets WHERE transaction_id = ? ORDER BY created_at",
    )
      .bind(tx.id)
      .all<{ serial: string }>();
    tickets = rows.results.map((t) => ({ serial: t.serial, url: `${c.env.WEB_BASE_URL}/t/${t.serial}` }));
  }
  return c.json({ transaction: tx, tickets });
});

/* ------------------------------ Billet + QR ------------------------------- */

pub.get("/tickets/:serial", async (c) => {
  const ticket = await c.env.DB.prepare(
    `SELECT t.*, tc.name AS category_name, tc.perks AS category_perks, tc.price_cents, tc.currency,
            e.title AS event_title, e.starts_at, e.ends_at, e.venue, e.address, e.dress_code, e.public_slug, e.refund_policy
     FROM tickets t
     JOIN ticket_categories tc ON tc.id = t.category_id
     JOIN events e ON e.id = t.event_id
     WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{ id: string; [k: string]: unknown }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  const qr_payload = await buildTicketPayload(c.env.TICKET_SIGNING_KEY, ticket.id);
  const { id: _id, ...safe } = ticket;
  return c.json({ ticket: safe, qr_payload });
});

pub.get("/tickets/:serial/ics", async (c) => {
  const ticket = await c.env.DB.prepare(
    `SELECT e.id AS event_id, e.title, e.description, e.starts_at, e.ends_at, e.venue, e.address, e.public_slug
     FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{
      event_id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
      venue: string | null; address: string | null; public_slug: string;
    }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  const ics = buildIcsEvent({
    uid: ticket.event_id,
    title: ticket.title,
    description: ticket.description,
    location: [ticket.venue, ticket.address].filter(Boolean).join(", ") || null,
    startsAt: ticket.starts_at,
    endsAt: ticket.ends_at,
    url: `https://eventgalo.com/e/${ticket.public_slug}`,
  });
  return icsResponse(ics, ticket.public_slug);
});

function parseRefundPolicy(raw: unknown): { kind?: string; days_before?: number; percent?: number } | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

pub.post("/tickets/:serial/refund-request", async (c) => {
  const b = await c.req.json<{ reason?: string; email?: string }>().catch(() => ({}) as Record<string, never>);
  const ticket = await c.env.DB.prepare(
    `SELECT t.id, t.transaction_id, t.buyer_email, t.status, e.starts_at, e.refund_policy
     FROM tickets t JOIN events e ON e.id = t.event_id
     WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{
      id: string; transaction_id: string; buyer_email: string; status: string;
      starts_at: string; refund_policy: string | null;
    }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  if (ticket.status !== "valid") return c.json({ error: "Ce billet n'est plus remboursable" }, 409);
  if ((b.email ?? "").trim().toLowerCase() !== ticket.buyer_email) {
    return c.json({ error: "L'email ne correspond pas à l'acheteur du billet" }, 403);
  }
  const policy = parseRefundPolicy(ticket.refund_policy);
  if (policy?.kind === "none") {
    return c.json({ error: "Cet événement n'accepte pas les remboursements" }, 409);
  }
  const daysBefore = Number(policy?.days_before ?? 0);
  if (policy && daysBefore > 0) {
    const deadline = new Date(ticket.starts_at).getTime() - daysBefore * 86_400_000;
    if (Date.now() > deadline) {
      return c.json(
        { error: `Le délai de remboursement est dépassé (${daysBefore} jour${daysBefore > 1 ? "s" : ""} avant l'événement)` },
        409,
      );
    }
  }
  const existing = await c.env.DB.prepare(
    "SELECT id FROM refund_requests WHERE ticket_id = ? AND status = 'pending'",
  ).bind(ticket.id).first();
  if (existing) return c.json({ error: "Une demande est déjà en cours pour ce billet" }, 409);
  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO refund_requests (id, ticket_id, transaction_id, reason) VALUES (?, ?, ?, ?)",
  )
    .bind(id, ticket.id, ticket.transaction_id, b.reason ?? null)
    .run();
  return c.json({ ok: true, id }, 201);
});

pub.patch("/tickets/:serial/transfer", async (c) => {
  // 10 requêtes / min par IP : dissuade les tentatives de deviner l'email de l'acheteur.
  if (await isRateLimited(c.env, "ticket-transfer", clientIp(c), 10, 60)) return tooManyRequests(c);
  const b = await c.req
    .json<{ email?: string; new_name?: string; new_email?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const newName = String(b.new_name ?? "").trim();
  const newEmail = String(b.new_email ?? "").trim().toLowerCase();
  if (!newName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return c.json({ error: "Nom et email du nouveau titulaire requis" }, 400);
  }

  const ticket = await c.env.DB.prepare(
    `SELECT t.id, t.buyer_name, t.buyer_email, t.status, e.title AS event_title, e.public_slug
     FROM tickets t JOIN events e ON e.id = t.event_id
     WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{ id: string; buyer_name: string; buyer_email: string; status: string; event_title: string; public_slug: string }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  if (ticket.status !== "valid") return c.json({ error: "Ce billet ne peut plus être transféré" }, 409);
  if ((b.email ?? "").trim().toLowerCase() !== ticket.buyer_email) {
    return c.json({ error: "L'email ne correspond pas à l'acheteur du billet" }, 403);
  }
  if (newEmail === ticket.buyer_email) {
    return c.json({ error: "Ce billet vous appartient déjà" }, 400);
  }

  await c.env.DB.prepare("UPDATE tickets SET buyer_name = ?, buyer_email = ? WHERE id = ?")
    .bind(newName, newEmail, ticket.id)
    .run();

  const url = `${c.env.WEB_BASE_URL}/t/${c.req.param("serial").toUpperCase()}`;
  c.executionCtx.waitUntil(
    Promise.all([
      sendEmail(
        c.env,
        newEmail,
        `Un billet vous a été transféré — ${ticket.event_title}`,
        layout(
          `${ticket.buyer_name} vous a transféré un billet !`,
          `<p>Vous êtes maintenant titulaire d'un billet pour <strong>${ticket.event_title}</strong>.</p>
           <p><a href="${url}">Voir mon billet</a></p>`,
        ),
        url,
      ),
      sendEmail(
        c.env,
        ticket.buyer_email,
        `Transfert confirmé — ${ticket.event_title}`,
        layout(
          "Transfert confirmé",
          `<p>Votre billet pour <strong>${ticket.event_title}</strong> a bien été transféré à ${newName} (${newEmail}).</p>`,
        ),
      ),
    ]),
  );
  return c.json({ ok: true });
});

/* ---------------------------------- Scan ---------------------------------- */

pub.post("/scan", async (c) => {
  const b = await c.req.json<{ scanner_key?: string; payload?: string }>().catch(() => ({}) as Record<string, never>);
  if (!b.scanner_key || !b.payload) return c.json({ error: "scanner_key et payload requis" }, 400);

  const event = await c.env.DB.prepare("SELECT id FROM events WHERE scanner_key = ?")
    .bind(b.scanner_key)
    .first<{ id: string }>();
  if (!event) return c.json({ ok: false, status: "invalid_signature", message: "Clé de scan invalide" }, 403);

  const ticketId = await verifyTicketPayload(c.env.TICKET_SIGNING_KEY, b.payload);
  if (!ticketId) {
    return c.json({ ok: false, status: "invalid_signature", message: "QR code falsifié ou illisible" });
  }
  const result = await callEventDO(c.env, event.id, {
    action: "scan",
    ticket_id: ticketId,
    event_id: event.id,
  });
  return c.json(result);
});

export default pub;
