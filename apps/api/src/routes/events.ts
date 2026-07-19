import { Hono } from "hono";
import Stripe from "stripe";
import type { AppContext, Env } from "../types";
import { nowIso, randomToken, slugify, uuid } from "../lib/crypto";
import { requireAuth } from "../lib/auth";
import { eventLogoUrl, layout, sendEmail } from "../lib/email";
import { MAX_MEDIA_PER_EVENT, MEDIA_LIST_QUERY, validateMediaFile } from "../lib/media";
import { callEventDO, DOError } from "../do/event-do";
import { notifyWaitlist } from "../lib/waitlist";
import { clampText } from "../lib/profile";

const events = new Hono<AppContext>();
events.use("*", requireAuth);

interface EventRow {
  id: string;
  organizer_id: string;
  title: string;
  capacity: number;
  starts_at: string;
  type: string;
  status: string;
  public_slug: string;
  scanner_key: string;
  [k: string]: unknown;
}

/** Un événement est accessible à son organisateur ET à ses co-organisateurs. */
async function getOwnedEvent(env: Env, eventId: string, userId: string): Promise<EventRow | null> {
  return env.DB.prepare(
    `SELECT e.* FROM events e
     WHERE e.id = ? AND (e.organizer_id = ? OR EXISTS (
       SELECT 1 FROM event_collaborators c WHERE c.event_id = e.id AND c.user_id = ?
     ))`,
  )
    .bind(eventId, userId, userId)
    .first<EventRow>();
}

async function sumCategoryQuantities(env: Env, eventId: string, excludeCategoryId?: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS total FROM ticket_categories WHERE event_id = ?${excludeCategoryId ? " AND id != ?" : ""}`,
  )
    .bind(...(excludeCategoryId ? [eventId, excludeCategoryId] : [eventId]))
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/* ------------------------------- Événements ------------------------------ */

events.post("/", async (c) => {
  const user = c.get("user");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const title = String(b.title ?? "").trim();
  const starts_at = String(b.starts_at ?? "").trim();
  if (!title || !starts_at) return c.json({ error: "Titre et date de début requis" }, 400);
  const capacity = Math.max(0, Number(b.capacity ?? 0) | 0);
  const type = b.type === "ticketed" ? "ticketed" : "private";
  const status = b.status === "draft" ? "draft" : "published";

  const id = uuid();
  const slug = slugify(title);
  const scannerKey = randomToken(12);
  await c.env.DB.prepare(
    `INSERT INTO events (id, organizer_id, title, description, starts_at, ends_at, venue, address,
       dress_code, seating_plan, capacity, public_slug, scanner_key, type, status, refund_policy, rsvp_question, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, user.id, title,
      (b.description as string) ?? null, starts_at, (b.ends_at as string) ?? null,
      (b.venue as string) ?? null, (b.address as string) ?? null,
      (b.dress_code as string) ?? null, (b.seating_plan as string) ?? null,
      capacity, slug, scannerKey, type, status,
      b.refund_policy ? JSON.stringify(b.refund_policy) : null,
      (b.rsvp_question as string) || null,
      nowIso(), nowIso(),
    )
    .run();
  const created = await getOwnedEvent(c.env, id, user.id);
  return c.json({ event: created }, 201);
});

events.get("/", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    `SELECT e.*, (e.organizer_id = ?) AS is_owner,
       (SELECT COUNT(*) FROM guests g WHERE g.event_id = e.id) AS guest_count,
       (SELECT COUNT(*) FROM guests g WHERE g.event_id = e.id AND g.rsvp_status = 'yes') AS yes_count,
       (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('valid','used')) AS tickets_sold
     FROM events e
     WHERE e.organizer_id = ? OR EXISTS (
       SELECT 1 FROM event_collaborators c WHERE c.event_id = e.id AND c.user_id = ?
     )
     ORDER BY e.starts_at DESC`,
  )
    .bind(user.id, user.id, user.id)
    .all();
  return c.json({ events: rows.results });
});

events.get("/:id", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const [guests, categories, sellers, quotas, announcements, refunds, sales, waitlist, collaborators, sponsorTiers, sponsors, performers] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM guests WHERE event_id = ? ORDER BY created_at").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM ticket_categories WHERE event_id = ? ORDER BY price_cents").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM sellers WHERE event_id = ? ORDER BY created_at").bind(event.id).all(),
    c.env.DB.prepare(
      `SELECT q.* FROM seller_quotas q JOIN sellers s ON s.id = q.seller_id WHERE s.event_id = ?`,
    ).bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM announcements WHERE event_id = ? ORDER BY created_at DESC").bind(event.id).all(),
    c.env.DB.prepare(
      `SELECT r.*, t.serial, t.buyer_name, t.buyer_email, c2.name AS category_name, tr.amount_cents / tr.quantity AS unit_cents, tr.currency
       FROM refund_requests r
       JOIN tickets t ON t.id = r.ticket_id
       JOIN transactions tr ON tr.id = r.transaction_id
       JOIN ticket_categories c2 ON c2.id = t.category_id
       WHERE t.event_id = ? ORDER BY r.created_at DESC`,
    ).bind(event.id).all(),
    c.env.DB.prepare(
      `SELECT t.seller_id, t.category_id, COUNT(*) AS count, SUM(tr.amount_cents / tr.quantity) AS revenue_cents
       FROM tickets t JOIN transactions tr ON tr.id = t.transaction_id
       WHERE t.event_id = ? AND t.status IN ('valid','used')
       GROUP BY t.seller_id, t.category_id`,
    ).bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM waitlist WHERE event_id = ? ORDER BY created_at").bind(event.id).all(),
    c.env.DB.prepare(
      `SELECT c.id, c.user_id, u.email, u.name, c.created_at
       FROM event_collaborators c JOIN users u ON u.id = c.user_id
       WHERE c.event_id = ? ORDER BY c.created_at`,
    ).bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM sponsor_tiers WHERE event_id = ? ORDER BY rank, price_cents DESC").bind(event.id).all(),
    c.env.DB.prepare(
      `SELECT s.*, t.name AS tier_name,
              (co.verified_at IS NOT NULL OR co.registry_verified_at IS NOT NULL) AS company_verified,
              (SELECT rating FROM sponsor_reviews r WHERE r.sponsor_id = s.id AND r.rated_by = 'organizer') AS my_rating,
              (SELECT comment FROM sponsor_reviews r WHERE r.sponsor_id = s.id AND r.rated_by = 'organizer') AS my_comment,
              (SELECT rating FROM sponsor_reviews r WHERE r.sponsor_id = s.id AND r.rated_by = 'company') AS company_rating
       FROM sponsors s
       LEFT JOIN sponsor_tiers t ON t.id = s.tier_id
       LEFT JOIN companies co ON co.id = s.company_id
       WHERE s.event_id = ? ORDER BY s.created_at DESC`,
    ).bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM event_performers WHERE event_id = ? ORDER BY rank, created_at").bind(event.id).all(),
  ]);
  return c.json({
    event,
    is_owner: event.organizer_id === user.id,
    guests: guests.results,
    categories: categories.results,
    sellers: sellers.results,
    seller_quotas: quotas.results,
    announcements: announcements.results,
    refund_requests: refunds.results,
    sales: sales.results,
    waitlist: waitlist.results,
    sponsor_tiers: sponsorTiers.results,
    sponsors: sponsors.results,
    performers: performers.results,
    collaborators: collaborators.results,
  });
});

events.patch("/:id", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);

  if (b.status !== undefined && !["draft", "published", "archived"].includes(String(b.status))) {
    return c.json({ error: "Statut invalide" }, 400);
  }

  if (b.capacity !== undefined) {
    const newCapacity = Number(b.capacity) | 0;
    const catSum = await sumCategoryQuantities(c.env, event.id);
    const soldRow = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(sold), 0) AS total FROM ticket_categories WHERE event_id = ?",
    ).bind(event.id).first<{ total: number }>();
    const totalSold = soldRow?.total ?? 0;
    if (newCapacity < catSum) {
      return c.json({ error: `Capacité (${newCapacity}) inférieure à la somme des catégories (${catSum})` }, 409);
    }
    if (newCapacity < totalSold) {
      return c.json({ error: `Capacité (${newCapacity}) inférieure aux billets déjà vendus (${totalSold})` }, 409);
    }
  }

  const allowed = [
    "title", "description", "starts_at", "ends_at", "venue", "address",
    "dress_code", "seating_plan", "capacity", "type", "status", "rsvp_question",
  ] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (b[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(b[key]);
    }
  }
  if (b.refund_policy !== undefined) {
    sets.push("refund_policy = ?");
    values.push(b.refund_policy ? JSON.stringify(b.refund_policy) : null);
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  sets.push("updated_at = ?");
  values.push(nowIso(), event.id);
  await c.env.DB.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  return c.json({ event: await getOwnedEvent(c.env, event.id, user.id) });
});

/* --------------------------- Co-organisateurs ----------------------------- */

events.post("/:id/collaborators", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  if (event.organizer_id !== user.id) {
    return c.json({ error: "Seul l'organisateur principal peut ajouter des co-organisateurs" }, 403);
  }
  const b = await c.req.json<{ email?: string }>().catch(() => ({}) as Record<string, never>);
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Adresse email invalide" }, 400);
  if (email === user.email.toLowerCase()) return c.json({ error: "Vous êtes déjà organisateur de cet événement" }, 400);

  let collaborator = await c.env.DB.prepare("SELECT id, email, name FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; name: string | null }>();
  if (!collaborator) {
    const id = uuid();
    await c.env.DB.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, email, null, nowIso())
      .run();
    collaborator = { id, email, name: null };
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM event_collaborators WHERE event_id = ? AND user_id = ?",
  ).bind(event.id, collaborator.id).first();
  if (existing) return c.json({ error: "Cette personne est déjà co-organisatrice" }, 409);

  const collaboratorRowId = uuid();
  await c.env.DB.prepare("INSERT INTO event_collaborators (id, event_id, user_id) VALUES (?, ?, ?)")
    .bind(collaboratorRowId, event.id, collaborator.id)
    .run();

  c.executionCtx.waitUntil(
    sendEmail(
      c.env,
      email,
      `Vous co-organisez maintenant : ${event.title}`,
      layout(
        "Vous êtes co-organisateur·rice",
        `<p>${user.name ?? user.email} vous a ajouté·e comme co-organisateur·rice de <strong>${event.title}</strong>.</p>
         <p>Connectez-vous sur EventGalo avec cette adresse (${email}) pour y accéder.</p>`,
      ),
    ),
  );
  return c.json({ id: collaboratorRowId, user_id: collaborator.id, email: collaborator.email, name: collaborator.name }, 201);
});

events.delete("/:id/collaborators/:cid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  if (event.organizer_id !== user.id) {
    return c.json({ error: "Seul l'organisateur principal peut retirer des co-organisateurs" }, 403);
  }
  await c.env.DB.prepare("DELETE FROM event_collaborators WHERE id = ? AND event_id = ?")
    .bind(c.req.param("cid"), event.id)
    .run();
  return c.json({ ok: true });
});

events.post("/:id/duplicate", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);

  const categories = await c.env.DB.prepare(
    "SELECT name, description, perks, price_cents, currency, quantity FROM ticket_categories WHERE event_id = ?",
  )
    .bind(event.id)
    .all<{ name: string; description: string | null; perks: string | null; price_cents: number; currency: string; quantity: number }>();

  const newId = uuid();
  const slug = slugify(`${String(event.title)}-copie`);
  const scannerKey = randomToken(12);
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO events (id, organizer_id, title, description, starts_at, ends_at, venue, address,
         dress_code, seating_plan, capacity, public_slug, scanner_key, type, status, refund_policy, rsvp_question, created_at, updated_at)
       SELECT ?, organizer_id, title, description, starts_at, ends_at, venue, address,
         dress_code, seating_plan, capacity, ?, ?, type, 'draft', refund_policy, rsvp_question, ?, ?
       FROM events WHERE id = ?`,
    ).bind(newId, slug, scannerKey, nowIso(), nowIso(), event.id),
  ];
  for (const cat of categories.results) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO ticket_categories (id, event_id, name, description, perks, price_cents, currency, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), newId, cat.name, cat.description, cat.perks, cat.price_cents, cat.currency, cat.quantity),
    );
  }
  await c.env.DB.batch(statements);

  const created = await getOwnedEvent(c.env, newId, user.id);
  return c.json({ event: created }, 201);
});

/* --------------------------------- Invités ------------------------------- */

events.post("/:id/guests", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ guests?: Array<Record<string, unknown>> }>().catch(() => ({}) as Record<string, never>);
  const list = Array.isArray(b.guests) ? b.guests : [];
  if (!list.length) return c.json({ error: "Liste d'invités vide" }, 400);
  if (list.length > 200) return c.json({ error: "Maximum 200 invités par lot" }, 400);

  const created = [];
  const statements = [];
  for (const g of list) {
    const name = String(g.name ?? "").trim();
    if (!name) continue;
    const id = uuid();
    const token = randomToken(18);
    created.push({ id, name, token });
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO guests (id, event_id, name, email, phone, token, table_name, plus_ones, guardian_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, event.id, name,
        (g.email as string) || null, (g.phone as string) || null,
        token, (g.table_name as string) || null, Number(g.plus_ones ?? 0) | 0,
        (g.guardian_name as string) || null,
      ),
    );
  }
  if (!statements.length) return c.json({ error: "Aucun invité valide" }, 400);
  await c.env.DB.batch(statements);

  // Envoi des invitations par email (si adresse fournie et Resend configuré)
  c.executionCtx.waitUntil(
    (async () => {
      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const rec = created[i];
        if (g?.email && rec) {
          const url = `${c.env.WEB_BASE_URL}/i/${rec.token}`;
          await sendEmail(
            c.env,
            String(g.email),
            `Invitation : ${event.title}`,
            layout(
              `Vous êtes invité·e — ${event.title}`,
              `<p>Voici votre lien d'invitation personnel :</p>
               <p><a href="${url}">${url}</a></p>
               <p>Vous y trouverez tous les détails et pourrez confirmer votre présence en un clic.</p>`,
              { logoUrl: await eventLogoUrl(c.env, event.id), eventTitle: String(event.title) },
            ),
            url,
          );
        }
      }
    })(),
  );

  const rows = await c.env.DB.prepare("SELECT * FROM guests WHERE event_id = ? ORDER BY created_at")
    .bind(event.id)
    .all();
  return c.json({ guests: rows.results }, 201);
});

events.delete("/:id/guests/:gid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  // Les photos de l'invité deviennent orphelines (modérables par l'organisateur)
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE media SET guest_id = NULL WHERE guest_id = ?").bind(c.req.param("gid")),
    c.env.DB.prepare("DELETE FROM guests WHERE id = ? AND event_id = ?").bind(c.req.param("gid"), event.id),
  ]);
  return c.json({ ok: true });
});

/* -------------------------------- Annonces ------------------------------- */

events.post("/:id/announcements", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ body?: string }>().catch(() => ({}) as Record<string, never>);
  const text = (b.body ?? "").trim();
  if (!text) return c.json({ error: "Message vide" }, 400);
  const id = uuid();
  await c.env.DB.prepare("INSERT INTO announcements (id, event_id, body) VALUES (?, ?, ?)")
    .bind(id, event.id, text)
    .run();

  // Notification email aux invités ayant une adresse
  c.executionCtx.waitUntil(
    (async () => {
      const [guests, logoUrl] = await Promise.all([
        c.env.DB.prepare(
          "SELECT name, email, token FROM guests WHERE event_id = ? AND email IS NOT NULL",
        ).bind(event.id).all<{ name: string; email: string; token: string }>(),
        eventLogoUrl(c.env, event.id),
      ]);
      for (const g of guests.results) {
        await sendEmail(
          c.env,
          g.email,
          `Mise à jour : ${event.title}`,
          layout(
            `Mise à jour — ${event.title}`,
            `<p>${text}</p><p><a href="${c.env.WEB_BASE_URL}/i/${g.token}">Voir l'invitation</a></p>`,
            { logoUrl, eventTitle: String(event.title) },
          ),
        );
      }
    })(),
  );
  return c.json({ ok: true, id }, 201);
});

/* ------------------------- Catégories de billets ------------------------- */

/** Normalise la liste d'avantages d'une catégorie : max 30 entrées de 140 caractères. */
function sanitizePerks(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const perks = raw
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((p) => p.slice(0, 140));
  return perks.length ? JSON.stringify(perks) : null;
}

events.post("/:id/categories", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = String(b.name ?? "").trim();
  const quantity = Number(b.quantity ?? 0) | 0;
  const price = Math.max(0, Number(b.price_cents ?? 0) | 0);
  if (!name || quantity < 1) return c.json({ error: "Nom et quantité (≥1) requis" }, 400);

  const existing = await sumCategoryQuantities(c.env, event.id);
  if (existing + quantity > event.capacity) {
    return c.json(
      { error: `Somme des catégories (${existing + quantity}) dépasserait la capacité totale (${event.capacity})` },
      409,
    );
  }
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO ticket_categories (id, event_id, name, description, perks, price_cents, currency, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, event.id, name, (b.description as string) ?? null, sanitizePerks(b.perks), price, String(b.currency ?? "CAD"), quantity)
    .run();
  return c.json({ id }, 201);
});

events.patch("/:id/categories/:cid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const cat = await c.env.DB.prepare("SELECT * FROM ticket_categories WHERE id = ? AND event_id = ?")
    .bind(c.req.param("cid"), event.id)
    .first<{ id: string; sold: number; quantity: number }>();
  if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);

  if (b.quantity !== undefined) {
    const newQty = Number(b.quantity) | 0;
    if (newQty < cat.sold) {
      return c.json({ error: `Impossible de réduire sous les ${cat.sold} billets déjà vendus` }, 409);
    }
    const others = await sumCategoryQuantities(c.env, event.id, cat.id);
    if (others + newQty > event.capacity) {
      return c.json({ error: `Somme des catégories (${others + newQty}) dépasserait la capacité (${event.capacity})` }, 409);
    }
    const quotasRow = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(quota),0) AS total FROM seller_quotas WHERE category_id = ?",
    ).bind(cat.id).first<{ total: number }>();
    if ((quotasRow?.total ?? 0) > newQty) {
      return c.json({ error: `Les quotas vendeurs (${quotasRow?.total}) dépasseraient la nouvelle quantité (${newQty})` }, 409);
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["name", "description", "price_cents", "quantity"] as const) {
    if (b[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(b[key]);
    }
  }
  if (b.perks !== undefined) {
    sets.push("perks = ?");
    values.push(sanitizePerks(b.perks));
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  values.push(cat.id);
  await c.env.DB.prepare(`UPDATE ticket_categories SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();

  if (b.quantity !== undefined) {
    const freed = (Number(b.quantity) | 0) - cat.quantity;
    if (freed > 0) c.executionCtx.waitUntil(notifyWaitlist(c.env, cat.id, freed));
  }
  return c.json({ ok: true });
});

/* ----------------------------- Liste d'attente ---------------------------- */

events.delete("/:id/waitlist/:wid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM waitlist WHERE id = ? AND event_id = ?")
    .bind(c.req.param("wid"), event.id)
    .run();
  return c.json({ ok: true });
});

/* -------------------------------- Vendeurs ------------------------------- */

events.post("/:id/sellers", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ name?: string; email?: string; quotas?: Array<{ category_id: string; quota: number }> }>()
    .catch(() => ({}) as Record<string, never>);
  const name = String(b.name ?? "").trim();
  if (!name) return c.json({ error: "Nom du vendeur requis" }, 400);
  const quotas = Array.isArray(b.quotas) ? b.quotas.filter((q) => q.category_id && Number(q.quota) > 0) : [];

  // Règle 5.4.3 : Σ(quotas d'une catégorie) ≤ quantité de la catégorie
  for (const q of quotas) {
    const cat = await c.env.DB.prepare("SELECT quantity FROM ticket_categories WHERE id = ? AND event_id = ?")
      .bind(q.category_id, event.id)
      .first<{ quantity: number }>();
    if (!cat) return c.json({ error: `Catégorie ${q.category_id} introuvable` }, 400);
    const assigned = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(quota),0) AS total FROM seller_quotas WHERE category_id = ?",
    ).bind(q.category_id).first<{ total: number }>();
    if ((assigned?.total ?? 0) + Number(q.quota) > cat.quantity) {
      return c.json(
        { error: `Quota trop élevé : ${(assigned?.total ?? 0) + Number(q.quota)} > ${cat.quantity} pour cette catégorie` },
        409,
      );
    }
  }

  const sellerId = uuid();
  const code = randomToken(9).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || randomToken(8);
  const statements = [
    c.env.DB.prepare("INSERT INTO sellers (id, event_id, name, email, code) VALUES (?, ?, ?, ?, ?)")
      .bind(sellerId, event.id, name, b.email ?? null, code),
  ];
  for (const q of quotas) {
    statements.push(
      c.env.DB.prepare("INSERT INTO seller_quotas (id, seller_id, category_id, quota) VALUES (?, ?, ?, ?)")
        .bind(uuid(), sellerId, q.category_id, Number(q.quota) | 0),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ id: sellerId, code }, 201);
});

events.patch("/:id/sellers/:sid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const sid = c.req.param("sid");
  const seller = await c.env.DB.prepare("SELECT id FROM sellers WHERE id = ? AND event_id = ?")
    .bind(sid, event.id)
    .first();
  if (!seller) return c.json({ error: "Vendeur introuvable" }, 404);
  const b = await c.req.json<{ name?: string; email?: string | null }>().catch(() => ({}) as Record<string, never>);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return c.json({ error: "Nom du vendeur requis" }, 400);
    sets.push("name = ?");
    values.push(name);
  }
  if (b.email !== undefined) {
    sets.push("email = ?");
    values.push(b.email || null);
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  values.push(sid);
  await c.env.DB.prepare(`UPDATE sellers SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

events.delete("/:id/sellers/:sid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const sid = c.req.param("sid");
  const seller = await c.env.DB.prepare("SELECT id FROM sellers WHERE id = ? AND event_id = ?")
    .bind(sid, event.id)
    .first();
  if (!seller) return c.json({ error: "Vendeur introuvable" }, 404);
  const sold = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE seller_id = ?")
    .bind(sid)
    .first<{ n: number }>();
  if ((sold?.n ?? 0) > 0) {
    return c.json({ error: "Impossible de supprimer : ce vendeur a déjà des ventes. Retirez plutôt ses quotas." }, 409);
  }
  await c.env.DB.prepare("DELETE FROM sellers WHERE id = ?").bind(sid).run();
  return c.json({ ok: true });
});

// Ajoute ou modifie le quota d'une catégorie pour un vendeur (upsert)
events.post("/:id/sellers/:sid/quotas", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const sid = c.req.param("sid");
  const seller = await c.env.DB.prepare("SELECT id FROM sellers WHERE id = ? AND event_id = ?")
    .bind(sid, event.id)
    .first();
  if (!seller) return c.json({ error: "Vendeur introuvable" }, 404);
  const b = await c.req.json<{ category_id?: string; quota?: number }>().catch(() => ({}) as Record<string, never>);
  const categoryId = String(b.category_id ?? "");
  const quota = Number(b.quota ?? 0) | 0;
  if (!categoryId || quota < 1) return c.json({ error: "Catégorie et quota (≥1) requis" }, 400);

  const cat = await c.env.DB.prepare("SELECT quantity FROM ticket_categories WHERE id = ? AND event_id = ?")
    .bind(categoryId, event.id)
    .first<{ quantity: number }>();
  if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);

  const existing = await c.env.DB.prepare(
    "SELECT id, sold FROM seller_quotas WHERE seller_id = ? AND category_id = ?",
  )
    .bind(sid, categoryId)
    .first<{ id: string; sold: number }>();
  if (existing && quota < existing.sold) {
    return c.json({ error: `Quota (${quota}) inférieur aux billets déjà vendus par ce vendeur (${existing.sold})` }, 409);
  }

  const otherAssigned = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(quota),0) AS total FROM seller_quotas WHERE category_id = ? AND seller_id != ?",
  )
    .bind(categoryId, sid)
    .first<{ total: number }>();
  if ((otherAssigned?.total ?? 0) + quota > cat.quantity) {
    return c.json(
      { error: `Quota trop élevé : ${(otherAssigned?.total ?? 0) + quota} > ${cat.quantity} pour cette catégorie` },
      409,
    );
  }

  if (existing) {
    await c.env.DB.prepare("UPDATE seller_quotas SET quota = ? WHERE id = ?").bind(quota, existing.id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO seller_quotas (id, seller_id, category_id, quota) VALUES (?, ?, ?, ?)")
      .bind(uuid(), sid, categoryId, quota)
      .run();
  }
  return c.json({ ok: true }, existing ? 200 : 201);
});

events.delete("/:id/sellers/:sid/quotas/:qid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const q = await c.env.DB.prepare(
    `SELECT q.id, q.sold FROM seller_quotas q JOIN sellers s ON s.id = q.seller_id
     WHERE q.id = ? AND q.seller_id = ? AND s.event_id = ?`,
  )
    .bind(c.req.param("qid"), c.req.param("sid"), event.id)
    .first<{ id: string; sold: number }>();
  if (!q) return c.json({ error: "Quota introuvable" }, 404);
  if (q.sold > 0) {
    return c.json({ error: "Impossible de retirer : des billets ont déjà été vendus dans cette catégorie" }, 409);
  }
  await c.env.DB.prepare("DELETE FROM seller_quotas WHERE id = ?").bind(q.id).run();
  return c.json({ ok: true });
});

/* ------------------------------ Remboursements ---------------------------- */

events.post("/:id/refund-requests/:rid/decision", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ approve?: boolean }>().catch(() => ({}) as Record<string, never>);

  const request = await c.env.DB.prepare(
    `SELECT r.*, t.event_id, t.category_id, tr.stripe_payment_intent, tr.amount_cents, tr.quantity, tr.currency
     FROM refund_requests r
     JOIN tickets t ON t.id = r.ticket_id
     JOIN transactions tr ON tr.id = r.transaction_id
     WHERE r.id = ? AND t.event_id = ? AND r.status = 'pending'`,
  )
    .bind(c.req.param("rid"), event.id)
    .first<{
      id: string; ticket_id: string; transaction_id: string; category_id: string;
      stripe_payment_intent: string | null; amount_cents: number; quantity: number; currency: string;
    }>();
  if (!request) return c.json({ error: "Demande introuvable ou déjà traitée" }, 404);

  if (!b.approve) {
    await c.env.DB.prepare("UPDATE refund_requests SET status = 'rejected', decided_at = ? WHERE id = ?")
      .bind(nowIso(), request.id)
      .run();
    return c.json({ ok: true, status: "rejected" });
  }

  // 1. Le billet retourne au pool + compteurs vendeur décrémentés (via DO, atomique)
  let resumedAfterPriorFailure = false;
  try {
    await callEventDO(c.env, event.id, { action: "refund_ticket", ticket_id: request.ticket_id });
  } catch (e) {
    if (!(e instanceof DOError)) throw e;
    // Le billet peut déjà être 'refunded' suite à une tentative précédente qui a
    // échoué après cette étape (ex. erreur Stripe non catchée) : la demande était
    // restée 'pending' alors que le billet, lui, était déjà remboursé côté billetterie.
    // On reprend le traitement au lieu de renvoyer une 409 définitive à chaque clic.
    const ticket = await c.env.DB.prepare("SELECT status FROM tickets WHERE id = ?")
      .bind(request.ticket_id)
      .first<{ status: string }>();
    if (ticket?.status !== "refunded") return c.json({ error: e.message }, 409);
    resumedAfterPriorFailure = true;
  }
  if (!resumedAfterPriorFailure) {
    c.executionCtx.waitUntil(notifyWaitlist(c.env, request.category_id, 1));
  }

  // 2. Refund Stripe (part du billet dans la transaction, pondérée par la politique)
  let policy: { kind?: string; percent?: number } | null = null;
  if (typeof event.refund_policy === "string" && event.refund_policy) {
    try {
      policy = JSON.parse(event.refund_policy);
    } catch {
      policy = null;
    }
  }
  const unitAmount = Math.floor(request.amount_cents / request.quantity);
  const refundAmount =
    policy?.kind === "partial"
      ? Math.floor((unitAmount * Math.min(100, Math.max(0, Number(policy.percent ?? 100)))) / 100)
      : unitAmount;
  let stripeRefundId: string | null = null;
  let stripeError: string | null = null;
  if (resumedAfterPriorFailure) {
    // On ne sait pas si la tentative précédente a atteint Stripe avant d'échouer :
    // ne jamais redéclencher un remboursement automatique ici (risque de rembourser
    // deux fois le même client). Un humain doit vérifier le paiement dans Stripe.
    stripeError =
      "Reprise après échec précédent : remboursement Stripe non redéclenché automatiquement " +
      `(vérifier manuellement le paiement ${request.stripe_payment_intent ?? "inconnu"} dans Stripe).`;
  } else if (request.stripe_payment_intent && c.env.STRIPE_SECRET_KEY && refundAmount > 0) {
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    try {
      const refund = await stripe.refunds.create({
        payment_intent: request.stripe_payment_intent,
        amount: refundAmount,
      });
      stripeRefundId = refund.id;
    } catch (e) {
      // Le billet est déjà marqué remboursé côté billetterie (étape 1, irréversible) :
      // on consigne l'échec Stripe dans la demande plutôt que de la laisser 'pending'
      // avec un bouton "Approuver" qui échouerait en 409 à chaque nouvelle tentative.
      stripeError = e instanceof Error ? e.message : "Erreur lors du remboursement Stripe";
    }
  }

  await c.env.DB.prepare(
    "UPDATE refund_requests SET status = 'approved', decided_at = ?, stripe_refund_id = ?, refund_amount_cents = ?, stripe_error = ? WHERE id = ?",
  )
    .bind(nowIso(), stripeRefundId, refundAmount, stripeError, request.id)
    .run();
  if (stripeError) {
    return c.json(
      { ok: true, status: "approved", stripe_refund_id: null, refund_amount_cents: refundAmount, stripe_error: stripeError },
      200,
    );
  }
  return c.json({ ok: true, status: "approved", stripe_refund_id: stripeRefundId, refund_amount_cents: refundAmount });
});

/* ------------------------------ Photos (média) ---------------------------- */

events.get("/:id/media", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const rows = await c.env.DB.prepare(MEDIA_LIST_QUERY).bind(event.id).all();
  return c.json({ media: rows.results });
});

events.post("/:id/media", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE event_id = ?")
    .bind(event.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MEDIA_PER_EVENT) {
    return c.json({ error: "La galerie de cet événement est pleine" }, 409);
  }
  const id = uuid();
  const key = `events/${event.id}/${id}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare(
    "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, NULL, ?, ?)",
  )
    .bind(id, event.id, key, file.type)
    .run();
  return c.json({ media: { id, guest_id: null, content_type: file.type } }, 201);
});

events.delete("/:id/media/:mid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const media = await c.env.DB.prepare("SELECT id, r2_key FROM media WHERE id = ? AND event_id = ?")
    .bind(c.req.param("mid"), event.id)
    .first<{ id: string; r2_key: string }>();
  if (!media) return c.json({ error: "Photo introuvable" }, 404);
  await c.env.MEDIA.delete(media.r2_key);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE events SET cover_media_id = NULL WHERE id = ? AND cover_media_id = ?").bind(event.id, media.id),
    c.env.DB.prepare("UPDATE events SET logo_media_id = NULL WHERE id = ? AND logo_media_id = ?").bind(event.id, media.id),
    c.env.DB.prepare("UPDATE sponsors SET logo_media_id = NULL WHERE event_id = ? AND logo_media_id = ?").bind(event.id, media.id),
    c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(media.id),
  ]);
  return c.json({ ok: true });
});

/** Marque/démarque une photo comme visible dans la galerie publique. */
events.patch("/:id/media/:mid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ featured?: boolean }>().catch(() => ({}) as Record<string, never>);
  const res = await c.env.DB.prepare("UPDATE media SET featured = ? WHERE id = ? AND event_id = ?")
    .bind(b.featured ? 1 : 0, c.req.param("mid"), event.id)
    .run();
  if (!res.meta.changes) return c.json({ error: "Photo introuvable" }, 404);
  return c.json({ ok: true });
});

/* --------------------------- Image de couverture --------------------------- */

events.patch("/:id/cover", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ media_id?: string | null }>().catch(() => ({}) as Record<string, never>);
  if (b.media_id) {
    const media = await c.env.DB.prepare("SELECT id FROM media WHERE id = ? AND event_id = ?")
      .bind(b.media_id, event.id)
      .first();
    if (!media) return c.json({ error: "Photo introuvable" }, 404);
  }
  await c.env.DB.prepare("UPDATE events SET cover_media_id = ? WHERE id = ?")
    .bind(b.media_id || null, event.id)
    .run();
  return c.json({ ok: true });
});

/* ------------------------ Logo de l'association ---------------------------- */

events.patch("/:id/logo", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ media_id?: string | null }>().catch(() => ({}) as Record<string, never>);
  if (b.media_id) {
    const media = await c.env.DB.prepare("SELECT id FROM media WHERE id = ? AND event_id = ?")
      .bind(b.media_id, event.id)
      .first();
    if (!media) return c.json({ error: "Photo introuvable" }, 404);
  }
  await c.env.DB.prepare("UPDATE events SET logo_media_id = ? WHERE id = ?")
    .bind(b.media_id || null, event.id)
    .run();
  return c.json({ ok: true });
});

/* -------------------------------- Sponsoring ------------------------------- */

events.post("/:id/sponsor-tiers", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = String(b.name ?? "").trim();
  const quantity = Math.max(1, Number(b.quantity ?? 1) | 0);
  if (!name) return c.json({ error: "Nom du palier requis" }, 400);
  const showcase = ["logo", "standard", "full"].includes(String(b.showcase)) ? String(b.showcase) : "logo";
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO sponsor_tiers (id, event_id, name, description, price_cents, currency, quantity, perks, rank, showcase)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, event.id, name, (b.description as string) || null,
      Math.max(0, Number(b.price_cents ?? 0) | 0), String(b.currency ?? "CAD"),
      quantity, sanitizePerks(b.perks), Math.max(0, Number(b.rank ?? 0) | 0), showcase,
    )
    .run();
  return c.json({ id }, 201);
});

events.patch("/:id/sponsor-tiers/:tid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const tier = await c.env.DB.prepare("SELECT id FROM sponsor_tiers WHERE id = ? AND event_id = ?")
    .bind(c.req.param("tid"), event.id)
    .first();
  if (!tier) return c.json({ error: "Palier introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["name", "description", "price_cents", "currency", "quantity", "rank"] as const) {
    if (b[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(b[key]);
    }
  }
  if (b.perks !== undefined) {
    sets.push("perks = ?");
    values.push(sanitizePerks(b.perks));
  }
  if (b.showcase !== undefined && ["logo", "standard", "full"].includes(String(b.showcase))) {
    sets.push("showcase = ?");
    values.push(String(b.showcase));
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  values.push(c.req.param("tid"));
  await c.env.DB.prepare(`UPDATE sponsor_tiers SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

events.delete("/:id/sponsor-tiers/:tid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const used = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sponsors WHERE tier_id = ? AND status IN ('pending','confirmed')",
  )
    .bind(c.req.param("tid"))
    .first<{ n: number }>();
  if ((used?.n ?? 0) > 0) {
    return c.json({ error: "Des sponsors sont engagés sur ce palier — impossible de le supprimer" }, 409);
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE sponsors SET tier_id = NULL WHERE tier_id = ?").bind(c.req.param("tid")),
    c.env.DB.prepare("DELETE FROM sponsor_tiers WHERE id = ? AND event_id = ?").bind(c.req.param("tid"), event.id),
  ]);
  return c.json({ ok: true });
});

/** Invite une entreprise : crée le sponsor avec un lien privé et envoie l'email. */
events.post("/:id/sponsors", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const email = String(b.contact_email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return c.json({ error: "Email de contact requis" }, 400);
  const id = uuid();
  const token = randomToken(16);
  await c.env.DB.prepare(
    `INSERT INTO sponsors (id, event_id, contact_email, contact_name, company_name, token)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, event.id, email, (b.contact_name as string) || null, (b.company_name as string) || null, token)
    .run();

  const url = `${c.env.WEB_BASE_URL}/sp/${token}`;
  const logoUrl = await eventLogoUrl(c.env, event.id);
  const result = await sendEmail(
    c.env,
    email,
    `Devenez sponsor — ${event.title}`,
    layout(
      `Invitation à sponsoriser ${event.title}`,
      `<p>Bonjour${b.contact_name ? ` ${b.contact_name}` : ""},</p>
       <p>L'organisation de <strong>${event.title}</strong> vous invite à devenir sponsor de l'événement.
       Découvrez les paliers de sponsoring et leurs avantages, puis confirmez votre engagement en ligne :</p>
       <p><a href="${url}">Voir les offres de sponsoring</a></p>`,
      { logoUrl, eventTitle: String(event.title) },
    ),
    url,
  );
  return c.json({ id, token, url, email_sent: result.sent, debug_url: result.debug_url }, 201);
});

/**
 * Demande de sponsoring en un clic depuis l'annuaire : l'email de l'entreprise
 * n'est jamais exposé à l'organisateur — la plateforme fait l'intermédiaire.
 */
events.post("/:id/sponsors/from-directory", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<{ company_id?: string; message?: string }>().catch(() => ({}) as Record<string, never>);
  if (!b.company_id) return c.json({ error: "Entreprise requise" }, 400);
  const co = await c.env.DB.prepare(
    `SELECT co.id, co.name, co.website, u.email AS owner_email
     FROM companies co JOIN users u ON u.id = co.owner_user_id
     WHERE co.id = ? AND co.listed = 1`,
  )
    .bind(b.company_id)
    .first<{ id: string; name: string; website: string | null; owner_email: string }>();
  if (!co) return c.json({ error: "Entreprise introuvable dans l'annuaire" }, 404);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM sponsors WHERE event_id = ? AND company_id = ? AND status IN ('invited','pending','confirmed')`,
  )
    .bind(event.id, co.id)
    .first();
  if (existing) return c.json({ error: `Une demande est déjà en cours auprès de ${co.name} pour cet événement` }, 409);

  const message = typeof b.message === "string" && b.message.trim() ? b.message.trim().slice(0, 800) : null;
  const id = uuid();
  const token = randomToken(16);
  await c.env.DB.prepare(
    `INSERT INTO sponsors (id, event_id, company_id, company_name, website, contact_email, token, invite_message, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'directory')`,
  )
    .bind(id, event.id, co.id, co.name, co.website, co.owner_email, token, message)
    .run();

  const url = `${c.env.WEB_BASE_URL}/sp/${token}`;
  const logoUrl = await eventLogoUrl(c.env, event.id);
  const result = await sendEmail(
    c.env,
    co.owner_email,
    `Proposition de sponsoring — ${event.title}`,
    layout(
      `${co.name} : une association aimerait vous avoir comme sponsor !`,
      `<p>L'organisation de <strong>${event.title}</strong> a découvert votre profil dans l'annuaire
         EventGalo et vous propose de sponsoriser son événement.</p>
       ${message ? `<p style="border-left:3px solid #f2c078;padding-left:12px;color:#555">« ${message} »</p>` : ""}
       <p>Découvrez les paliers proposés et leurs avantages, puis engagez-vous en ligne — ou déclinez si
          l'occasion ne vous convient pas :</p>
       <p><a href="${url}">Voir la proposition</a></p>`,
      { logoUrl, eventTitle: String(event.title) },
    ),
    url,
  );
  return c.json({ id, email_sent: result.sent, debug_url: result.debug_url }, 201);
});

/** Décision de l'organisateur : confirmer, refuser, ou repasser en attente. */
events.patch("/:id/sponsors/:sid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const sponsor = await c.env.DB.prepare("SELECT * FROM sponsors WHERE id = ? AND event_id = ?")
    .bind(c.req.param("sid"), event.id)
    .first<{ id: string; contact_email: string; company_name: string | null; status: string }>();
  if (!sponsor) return c.json({ error: "Sponsor introuvable" }, 404);
  const b = await c.req.json<{ status?: string }>().catch(() => ({}) as Record<string, never>);
  if (!b.status || !["pending", "confirmed", "declined"].includes(b.status)) {
    return c.json({ error: "Statut invalide" }, 400);
  }
  await c.env.DB.prepare("UPDATE sponsors SET status = ?, confirmed_at = ? WHERE id = ?")
    .bind(b.status, b.status === "confirmed" ? nowIso() : null, sponsor.id)
    .run();
  if (b.status === "confirmed") {
    const logoUrl = await eventLogoUrl(c.env, event.id);
    c.executionCtx.waitUntil(
      sendEmail(
        c.env,
        sponsor.contact_email,
        `Sponsoring confirmé — ${event.title}`,
        layout(
          "Votre sponsoring est confirmé !",
          `<p>Merci ! ${sponsor.company_name ? `<strong>${sponsor.company_name}</strong> figure` : "Vous figurez"}
           désormais parmi les sponsors de <strong>${event.title}</strong>.
           Votre logo apparaît sur la page publique de l'événement.</p>`,
          { logoUrl, eventTitle: String(event.title) },
        ),
      ).then(() => undefined),
    );
  }
  return c.json({ ok: true });
});

/** Décision sur une contre-proposition de montant : accepter ou refuser. */
events.post("/:id/sponsors/:sid/proposal", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const sponsor = await c.env.DB.prepare("SELECT * FROM sponsors WHERE id = ? AND event_id = ?")
    .bind(c.req.param("sid"), event.id)
    .first<{
      id: string; token: string; contact_email: string; company_name: string | null;
      amount_cents: number | null; proposed_cents: number | null; proposal_status: string | null;
    }>();
  if (!sponsor) return c.json({ error: "Sponsor introuvable" }, 404);
  if (sponsor.proposal_status !== "pending" || sponsor.proposed_cents == null) {
    return c.json({ error: "Aucune contre-proposition en attente" }, 409);
  }
  const b = await c.req.json<{ action?: string }>().catch(() => ({}) as Record<string, never>);
  if (b.action !== "accept" && b.action !== "reject") return c.json({ error: "Action invalide" }, 400);

  const accepted = b.action === "accept";
  if (accepted) {
    await c.env.DB.prepare(
      "UPDATE sponsors SET amount_cents = proposed_cents, proposal_status = 'accepted' WHERE id = ?",
    )
      .bind(sponsor.id)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE sponsors SET proposal_status = 'rejected' WHERE id = ?")
      .bind(sponsor.id)
      .run();
  }

  const url = `${c.env.WEB_BASE_URL}/sp/${sponsor.token}`;
  const proposed = (sponsor.proposed_cents / 100).toFixed(2);
  const logoUrl = await eventLogoUrl(c.env, event.id);
  c.executionCtx.waitUntil(
    sendEmail(
      c.env,
      sponsor.contact_email,
      accepted
        ? `Montant accepté — ${event.title}`
        : `Contre-proposition refusée — ${event.title}`,
      layout(
        accepted ? "Votre proposition est acceptée !" : "Contre-proposition refusée",
        accepted
          ? `<p>L'organisation de <strong>${event.title}</strong> accepte votre proposition de
               <strong>${proposed}&nbsp;$</strong>. Vous pouvez maintenant régler votre sponsoring en ligne :</p>
             <p><a href="${url}">Finaliser mon sponsoring</a></p>`
          : `<p>L'organisation de <strong>${event.title}</strong> a refusé votre proposition de
               ${proposed}&nbsp;$. Le montant du palier
               ${sponsor.amount_cents != null ? `(<strong>${(sponsor.amount_cents / 100).toFixed(2)}&nbsp;$</strong>)` : ""}
               reste en vigueur — vous pouvez le régler en ligne, proposer un autre montant ou décliner :</p>
             <p><a href="${url}">Ouvrir mon espace sponsor</a></p>`,
        { logoUrl, eventTitle: String(event.title) },
      ),
      url,
    ).then(() => undefined),
  );
  return c.json({ ok: true, proposal_status: accepted ? "accepted" : "rejected" });
});

/** Évaluation de l'entreprise sponsor par l'organisateur, après l'événement. */
events.post("/:id/sponsors/:sid/review", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const sponsor = await c.env.DB.prepare("SELECT id, status FROM sponsors WHERE id = ? AND event_id = ?")
    .bind(c.req.param("sid"), event.id)
    .first<{ id: string; status: string }>();
  if (!sponsor) return c.json({ error: "Sponsor introuvable" }, 404);
  if (sponsor.status !== "confirmed") return c.json({ error: "Seul un sponsoring confirmé peut être évalué" }, 409);
  const ref = (event.ends_at as string | null) ?? event.starts_at;
  if (!ref || String(ref) >= nowIso()) {
    return c.json({ error: "Vous pourrez évaluer ce sponsor après l'événement" }, 409);
  }

  const b = await c.req.json<{ rating?: number; comment?: string }>().catch(() => ({}) as Record<string, never>);
  const rating = Math.round(Number(b.rating ?? 0));
  if (rating < 1 || rating > 5) return c.json({ error: "Note entre 1 et 5 requise" }, 400);
  const comment = typeof b.comment === "string" && b.comment.trim() ? b.comment.trim().slice(0, 800) : null;

  await c.env.DB.prepare(
    `INSERT INTO sponsor_reviews (id, sponsor_id, rated_by, rating, comment) VALUES (?, ?, 'organizer', ?, ?)
     ON CONFLICT (sponsor_id, rated_by) DO UPDATE SET rating = excluded.rating, comment = excluded.comment`,
  )
    .bind(uuid(), sponsor.id, rating, comment)
    .run();
  return c.json({ ok: true, rating });
});

events.delete("/:id/sponsors/:sid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const res = await c.env.DB.prepare("DELETE FROM sponsors WHERE id = ? AND event_id = ?")
    .bind(c.req.param("sid"), event.id)
    .run();
  if (!res.meta.changes) return c.json({ error: "Sponsor introuvable" }, 404);
  return c.json({ ok: true });
});

/* --------------------------- Artistes & intervenants ------------------------ */

events.post("/:id/performers", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!name) return c.json({ error: "Nom requis" }, 400);
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO event_performers (id, event_id, name, role, bio, rank) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, event.id, name, clampText(b.role, 80), clampText(b.bio, 500),
      Math.max(0, Number(b.rank ?? 0) | 0),
    )
    .run();
  return c.json({ id }, 201);
});

events.patch("/:id/performers/:pid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const performer = await c.env.DB.prepare("SELECT id FROM event_performers WHERE id = ? AND event_id = ?")
    .bind(c.req.param("pid"), event.id)
    .first();
  if (!performer) return c.json({ error: "Artiste introuvable" }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (b.name !== undefined) {
    const name = String(b.name ?? "").trim().slice(0, 120);
    if (!name) return c.json({ error: "Nom requis" }, 400);
    sets.push("name = ?");
    values.push(name);
  }
  if (b.role !== undefined) {
    sets.push("role = ?");
    values.push(clampText(b.role, 80));
  }
  if (b.bio !== undefined) {
    sets.push("bio = ?");
    values.push(clampText(b.bio, 500));
  }
  if (b.rank !== undefined) {
    sets.push("rank = ?");
    values.push(Math.max(0, Number(b.rank ?? 0) | 0));
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  values.push(c.req.param("pid"));
  await c.env.DB.prepare(`UPDATE event_performers SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

events.delete("/:id/performers/:pid", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const performer = await c.env.DB.prepare(
    "SELECT photo1_media_id, photo2_media_id FROM event_performers WHERE id = ? AND event_id = ?",
  )
    .bind(c.req.param("pid"), event.id)
    .first<{ photo1_media_id: string | null; photo2_media_id: string | null }>();
  if (!performer) return c.json({ error: "Artiste introuvable" }, 404);
  const photoIds = [performer.photo1_media_id, performer.photo2_media_id].filter((v): v is string => Boolean(v));
  if (photoIds.length) {
    const keys = await c.env.DB.prepare(
      `SELECT r2_key FROM media WHERE id IN (${photoIds.map(() => "?").join(",")})`,
    )
      .bind(...photoIds)
      .all<{ r2_key: string }>();
    await Promise.all(keys.results.map((m) => c.env.MEDIA.delete(m.r2_key)));
  }
  // La ligne event_performers doit disparaître avant les lignes media qu'elle référence.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_performers WHERE id = ? AND event_id = ?").bind(c.req.param("pid"), event.id),
    ...(photoIds.length
      ? [c.env.DB.prepare(`DELETE FROM media WHERE id IN (${photoIds.map(() => "?").join(",")})`).bind(...photoIds)]
      : []),
  ]);
  return c.json({ ok: true });
});

/** Upload d'une des deux photos de l'artiste (?slot=1 ou 2). Remplace la photo existante du slot. */
events.post("/:id/performers/:pid/photo", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const slot = c.req.query("slot") === "2" ? "2" : "1";
  const column = slot === "2" ? "photo2_media_id" : "photo1_media_id";
  const performer = await c.env.DB.prepare(
    `SELECT id, ${column} AS current_media_id FROM event_performers WHERE id = ? AND event_id = ?`,
  )
    .bind(c.req.param("pid"), event.id)
    .first<{ id: string; current_media_id: string | null }>();
  if (!performer) return c.json({ error: "Artiste introuvable" }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);

  const id = uuid();
  const key = `events/${event.id}/${id}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare(
    "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, NULL, ?, ?)",
  )
    .bind(id, event.id, key, file.type)
    .run();
  await c.env.DB.prepare(`UPDATE event_performers SET ${column} = ? WHERE id = ?`)
    .bind(id, performer.id)
    .run();

  if (performer.current_media_id) {
    const old = await c.env.DB.prepare("SELECT r2_key FROM media WHERE id = ?")
      .bind(performer.current_media_id)
      .first<{ r2_key: string }>();
    if (old) {
      await c.env.MEDIA.delete(old.r2_key);
      await c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(performer.current_media_id).run();
    }
  }
  return c.json({ media_id: id }, 201);
});

events.delete("/:id/performers/:pid/photo", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const slot = c.req.query("slot") === "2" ? "2" : "1";
  const column = slot === "2" ? "photo2_media_id" : "photo1_media_id";
  const performer = await c.env.DB.prepare(
    `SELECT ${column} AS current_media_id FROM event_performers WHERE id = ? AND event_id = ?`,
  )
    .bind(c.req.param("pid"), event.id)
    .first<{ current_media_id: string | null }>();
  if (!performer?.current_media_id) return c.json({ error: "Aucune photo à supprimer" }, 404);
  const media = await c.env.DB.prepare("SELECT r2_key FROM media WHERE id = ?")
    .bind(performer.current_media_id)
    .first<{ r2_key: string }>();
  if (media) await c.env.MEDIA.delete(media.r2_key);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE event_performers SET ${column} = NULL WHERE id = ?`).bind(c.req.param("pid")),
    c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(performer.current_media_id),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------ Export (RGPD) ----------------------------- */

events.get("/:id/export", async (c) => {
  const user = c.get("user");
  const event = await getOwnedEvent(c.env, c.req.param("id"), user.id);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const [guests, categories, sellers, tickets, transactions, announcements] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM guests WHERE event_id = ?").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM ticket_categories WHERE event_id = ?").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM sellers WHERE event_id = ?").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM tickets WHERE event_id = ?").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM transactions WHERE event_id = ?").bind(event.id).all(),
    c.env.DB.prepare("SELECT * FROM announcements WHERE event_id = ?").bind(event.id).all(),
  ]);
  const payload = {
    exported_at: nowIso(),
    event,
    guests: guests.results,
    categories: categories.results,
    sellers: sellers.results,
    tickets: tickets.results,
    transactions: transactions.results,
    announcements: announcements.results,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="eventgalo-export-${event.public_slug}.json"`,
    },
  });
});

export default events;
