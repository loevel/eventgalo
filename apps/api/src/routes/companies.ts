import { Hono } from "hono";
import type { AppContext } from "../types";
import { nowIso, uuid } from "../lib/crypto";
import { requireAuth } from "../lib/auth";
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
