import { Hono } from "hono";
import type { AppContext } from "../types";
import { nowIso, randomToken, uuid } from "../lib/crypto";
import { requireAuth } from "../lib/auth";
import { eventLogoUrl, layout, sendEmail } from "../lib/email";
import { validateMediaFile } from "../lib/media";
import { clampText, sanitizeSocials } from "../lib/profile";

/* ---------------------- Espace entreprise (authentifié) -------------------- */

const company = new Hono<AppContext>();
company.use("*", requireAuth);

/** Profil entreprise du compte connecté (null si pas encore créé). */
company.get("/", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first();
  return c.json({ company: row ?? null });
});

/** Crée ou met à jour le profil entreprise du compte connecté. */
company.put("/", async (c) => {
  const user = c.get("user");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!name) return c.json({ error: "Nom de l'entreprise requis" }, 400);
  const existing = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  const values = [
    name,
    clampText(b.sector, 80),
    clampText(b.city, 80),
    clampText(b.description, 1200),
    clampText(b.website, 300),
    clampText(b.phone, 40),
    clampText(b.public_email, 120),
    sanitizeSocials(b.socials),
    b.listed ? 1 : 0,
    nowIso(),
  ];
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE companies SET name = ?, sector = ?, city = ?, description = ?, website = ?,
         phone = ?, public_email = ?, socials = ?, listed = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(...values, existing.id)
      .run();
    return c.json({ id: existing.id });
  }
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO companies (id, owner_user_id, name, sector, city, description, website,
       phone, public_email, socials, listed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, ...values)
    .run();
  return c.json({ id }, 201);
});

/** Logo de l'entreprise (R2, hors table media car sans événement). */
company.post("/logo", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT id, logo_key FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string; logo_key: string | null }>();
  if (!row) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);
  const key = `companies/${row.id}/${uuid()}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  if (row.logo_key) await c.env.MEDIA.delete(row.logo_key);
  await c.env.DB.prepare("UPDATE companies SET logo_key = ?, logo_type = ?, updated_at = ? WHERE id = ?")
    .bind(key, file.type, nowIso(), row.id)
    .run();
  return c.json({ ok: true });
});

/**
 * Réclamer ses sponsorings passés : retrouve les sponsorings d'événements dont le
 * contact est l'email du compte, les rattache au profil, et propose les infos
 * les plus riches pour préremplir le profil.
 */
company.post("/import", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  if (!row) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);
  const sponsorships = await c.env.DB.prepare(
    `SELECT id, company_name, website, description, address, phone, public_email, socials
     FROM sponsors WHERE contact_email = ? ORDER BY committed_at DESC, created_at DESC`,
  )
    .bind(user.email)
    .all<{
      id: string; company_name: string | null; website: string | null; description: string | null;
      address: string | null; phone: string | null; public_email: string | null; socials: string | null;
    }>();
  if (!sponsorships.results.length) {
    return c.json({ imported: 0, prefill: null });
  }
  await c.env.DB.prepare("UPDATE sponsors SET company_id = ? WHERE contact_email = ?")
    .bind(row.id, user.email)
    .run();
  // Le sponsoring le plus récent avec une description sert de base au profil.
  const richest = sponsorships.results.find((s) => s.description) ?? sponsorships.results[0];
  return c.json({
    imported: sponsorships.results.length,
    prefill: {
      name: richest.company_name,
      description: richest.description,
      website: richest.website,
      phone: richest.phone,
      public_email: richest.public_email,
      city: richest.address,
      socials: richest.socials,
    },
  });
});

/** Demandes et sponsorings liés à mon entreprise (par rattachement ou par email). */
company.get("/requests", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.token, s.status, s.amount_cents, s.paid_at, s.invite_message, s.source, s.created_at,
            t.name AS tier_name,
            e.title AS event_title, e.starts_at, e.venue, e.public_slug
     FROM sponsors s
     JOIN events e ON e.id = s.event_id
     LEFT JOIN sponsor_tiers t ON t.id = s.tier_id
     WHERE s.company_id = ? OR s.contact_email = ?
     ORDER BY s.created_at DESC LIMIT 50`,
  )
    .bind(co?.id ?? "-", user.email)
    .all();
  return c.json({ requests: rows.results });
});

/**
 * Candidature spontanée : l'entreprise se propose comme sponsor d'un événement.
 * Crée directement un engagement « en attente » (comme si elle avait suivi un
 * lien /sp et choisi ce palier) : l'organisateur confirme ou décline.
 */
company.post("/apply", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT * FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{
      id: string; name: string; website: string | null; description: string | null; city: string | null;
      phone: string | null; public_email: string | null; socials: string | null;
      logo_key: string | null; logo_type: string | null;
    }>();
  if (!co) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);

  const b = await c.req.json<{ event_id?: string; tier_id?: string; message?: string }>()
    .catch(() => ({}) as Record<string, never>);
  if (!b.event_id || !b.tier_id) return c.json({ error: "Événement et palier requis" }, 400);

  const event = await c.env.DB.prepare(
    `SELECT e.id, e.title, u.email AS organizer_email FROM events e JOIN users u ON u.id = e.organizer_id
     WHERE e.id = ? AND e.status = 'published'`,
  )
    .bind(b.event_id)
    .first<{ id: string; title: string; organizer_email: string }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const tier = await c.env.DB.prepare("SELECT * FROM sponsor_tiers WHERE id = ? AND event_id = ?")
    .bind(b.tier_id, event.id)
    .first<{ id: string; name: string; price_cents: number; quantity: number }>();
  if (!tier) return c.json({ error: "Palier introuvable" }, 404);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM sponsors WHERE event_id = ? AND (company_id = ? OR contact_email = ?)
     AND status IN ('invited','pending','confirmed')`,
  )
    .bind(event.id, co.id, user.email)
    .first();
  if (existing) return c.json({ error: "Vous avez déjà une demande en cours pour cet événement" }, 409);

  const taken = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sponsors WHERE tier_id = ? AND status IN ('pending','confirmed')",
  )
    .bind(tier.id)
    .first<{ n: number }>();
  if ((taken?.n ?? 0) >= tier.quantity) return c.json({ error: "Ce palier est complet" }, 409);

  const sponsorId = uuid();
  const token = randomToken(16);
  const message = clampText(b.message, 800);

  // Le logo de l'entreprise est copié dans la galerie de l'événement pour la vitrine.
  let logoMediaId: string | null = null;
  if (co.logo_key) {
    const obj = await c.env.MEDIA.get(co.logo_key);
    if (obj) {
      logoMediaId = uuid();
      const key = `events/${event.id}/${logoMediaId}`;
      await c.env.MEDIA.put(key, obj.body, { httpMetadata: { contentType: co.logo_type ?? "image/png" } });
      await c.env.DB.prepare(
        "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, NULL, ?, ?)",
      )
        .bind(logoMediaId, event.id, key, co.logo_type ?? "image/png")
        .run();
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO sponsors (id, event_id, tier_id, company_id, company_name, website, contact_email,
       logo_media_id, description, address, phone, public_email, socials, message,
       amount_cents, status, token, source, committed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'directory', ?)`,
  )
    .bind(
      sponsorId, event.id, tier.id, co.id, co.name, co.website, user.email,
      logoMediaId, co.description, co.city, co.phone, co.public_email, co.socials, message,
      tier.price_cents, token, nowIso(),
    )
    .run();

  const amount = (tier.price_cents / 100).toFixed(2);
  c.executionCtx.waitUntil(
    (async () =>
      void (await sendEmail(
        c.env,
        event.organizer_email,
        `Une entreprise se propose comme sponsor — ${event.title}`,
        layout(
          `${co.name} veut sponsoriser ${event.title} !`,
          `<p><strong>${co.name}</strong> a découvert votre événement dans les opportunités de sponsoring
             EventGalo et s'engage sur le palier <strong>${tier.name}</strong> (${amount}&nbsp;$).</p>
           ${message ? `<p style="border-left:3px solid #f2c078;padding-left:12px;color:#555">« ${message} »</p>` : ""}
           <p>Confirmez ou déclinez depuis l'onglet Sponsors de votre tableau de bord :</p>
           <p><a href="${c.env.WEB_BASE_URL}/dashboard/e/${event.id}">Ouvrir le tableau de bord</a></p>`,
          { logoUrl: await eventLogoUrl(c.env, event.id), eventTitle: event.title },
        ),
      )))(),
  );
  return c.json({ ok: true, token, status: "pending" }, 201);
});

/* ----------------------------- Annuaire public ----------------------------- */

const directory = new Hono<AppContext>();

directory.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const sector = (c.req.query("sector") ?? "").trim().slice(0, 80);
  const city = (c.req.query("city") ?? "").trim().slice(0, 80);
  const conditions = ["listed = 1"];
  const binds: unknown[] = [];
  if (q) {
    conditions.push("(name LIKE ? OR description LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (sector) {
    conditions.push("sector = ?");
    binds.push(sector);
  }
  if (city) {
    conditions.push("city LIKE ?");
    binds.push(`%${city}%`);
  }
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.sector, c.city, c.description, c.website, c.socials, c.public_email,
            (c.logo_key IS NOT NULL) AS has_logo,
            (SELECT COUNT(*) FROM sponsors s WHERE s.company_id = c.id AND s.status = 'confirmed') AS sponsorships
     FROM companies c
     WHERE ${conditions.join(" AND ")}
     ORDER BY sponsorships DESC, c.updated_at DESC LIMIT 60`,
  )
    .bind(...binds)
    .all();
  return c.json({ companies: rows.results });
});

/** Événements publiés à venir qui cherchent des sponsors (ont au moins un palier). */
directory.get("/opportunities", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const conditions = [
    "e.status = 'published'",
    "COALESCE(e.starts_at, '9999') > ?",
    "EXISTS (SELECT 1 FROM sponsor_tiers t WHERE t.event_id = e.id)",
  ];
  const binds: unknown[] = [nowIso()];
  if (q) {
    conditions.push("(e.title LIKE ? OR e.venue LIKE ? OR e.address LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const events = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.starts_at, e.venue, e.address, e.public_slug, e.logo_media_id, e.cover_media_id
     FROM events e WHERE ${conditions.join(" AND ")}
     ORDER BY e.starts_at ASC LIMIT 40`,
  )
    .bind(...binds)
    .all<{ id: string; [k: string]: unknown }>();
  const ids = events.results.map((e) => e.id);
  let tiers: Array<{ event_id: string; [k: string]: unknown }> = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT t.event_id, t.id, t.name, t.price_cents, t.currency, t.quantity, t.perks, t.showcase, t.rank,
              (SELECT COUNT(*) FROM sponsors s WHERE s.tier_id = t.id AND s.status IN ('pending','confirmed')) AS taken
       FROM sponsor_tiers t WHERE t.event_id IN (${placeholders}) ORDER BY t.rank, t.price_cents DESC`,
    )
      .bind(...ids)
      .all<{ event_id: string; [k: string]: unknown }>();
    tiers = rows.results;
  }
  return c.json({
    events: events.results.map((e) => ({ ...e, tiers: tiers.filter((t) => t.event_id === e.id) })),
  });
});

// Pas de condition `listed` : l'id UUID n'est pas devinable (même modèle que /media/:id/file),
// et le propriétaire doit voir son logo avant de publier son profil.
directory.get("/:id/logo", async (c) => {
  const row = await c.env.DB.prepare("SELECT logo_key, logo_type FROM companies WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ logo_key: string | null; logo_type: string | null }>();
  if (!row?.logo_key) return c.json({ error: "Logo introuvable" }, 404);
  const obj = await c.env.MEDIA.get(row.logo_key);
  if (!obj) return c.json({ error: "Logo introuvable" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.logo_type ?? "image/png",
      "Cache-Control": "public, max-age=3600",
      ETag: obj.httpEtag,
    },
  });
});

export { company as companyRoutes, directory as companyDirectoryRoutes };
