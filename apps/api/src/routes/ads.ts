import { Hono } from "hono";
import Stripe from "stripe";
import type { AppContext, Env } from "../types";
import { nowIso, uuid } from "../lib/crypto";
import { requireAuth } from "../lib/auth";
import { deleteProcessedImage, putProcessedImage, THUMB_SUFFIX, validateMediaFile } from "../lib/media";
import { getSetting } from "../lib/admin";

/* ---------------------- Espace entreprise (authentifié) -------------------- */

const company = new Hono<AppContext>();
company.use("*", requireAuth);

interface AdSlotRow {
  id: string;
  title: string;
  link_url: string;
  image_key: string | null;
  sector: string | null;
  region: string | null;
  weeks: number;
  starts_at: string | null;
  ends_at: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

/** Créneaux publicitaires de l'entreprise du compte connecté. */
company.get("/", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  if (!co) return c.json({ ads: [] });
  const rows = await c.env.DB.prepare(
    `SELECT id, title, link_url, image_key, sector, region, weeks, starts_at, ends_at,
            amount_cents, currency, status, paid_at, created_at
     FROM ad_slots WHERE company_id = ? ORDER BY created_at DESC`,
  )
    .bind(co.id)
    .all<AdSlotRow>();
  return c.json({ ads: rows.results });
});

/** Crée un créneau publicitaire en attente de paiement. */
company.post("/", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  if (!co) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);

  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const title = String(b.title ?? "").trim().slice(0, 80);
  const linkUrl = String(b.link_url ?? "").trim().slice(0, 500);
  const weeks = Math.min(12, Math.max(1, Number(b.weeks) | 0 || 1));
  const sector = typeof b.sector === "string" && b.sector.trim() ? b.sector.trim().slice(0, 80) : null;
  const region = typeof b.region === "string" && b.region.trim() ? b.region.trim().slice(0, 80) : null;
  if (!title) return c.json({ error: "Titre requis" }, 400);
  try {
    new URL(linkUrl);
  } catch {
    return c.json({ error: "Lien invalide" }, 400);
  }

  const pricePerWeek = Number(await getSetting(c.env, "ad_slot_price_cents_per_week"));
  const amountCents = pricePerWeek * weeks;
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO ad_slots (id, company_id, title, link_url, sector, region, weeks, amount_cents, currency, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CAD', 'pending_payment', ?)`,
  )
    .bind(id, co.id, title, linkUrl, sector, region, weeks, amountCents, nowIso())
    .run();
  return c.json({ id, amount_cents: amountCents }, 201);
});

/** Créative publicitaire (image), même pipeline que le logo entreprise. */
company.post("/:id/image", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `SELECT a.id, a.image_key FROM ad_slots a JOIN companies co ON co.id = a.company_id
     WHERE a.id = ? AND co.owner_user_id = ?`,
  )
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; image_key: string | null }>();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);
  const key = `ads/${row.id}/${uuid()}`;
  const contentType = await putProcessedImage(c.env, key, file);
  if (row.image_key) await deleteProcessedImage(c.env, row.image_key);
  await c.env.DB.prepare("UPDATE ad_slots SET image_key = ?, image_type = ? WHERE id = ?")
    .bind(key, contentType, row.id)
    .run();
  return c.json({ ok: true });
});

/** Session de paiement Stripe pour un créneau publicitaire — vente directe à la plateforme, pas de Connect. */
company.post("/:id/checkout", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.status, a.amount_cents, a.currency
     FROM ad_slots a JOIN companies co ON co.id = a.company_id
     WHERE a.id = ? AND co.owner_user_id = ?`,
  )
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; title: string; status: string; amount_cents: number; currency: string }>();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  if (row.status !== "pending_payment") return c.json({ error: "Ce créneau n'est plus en attente de paiement" }, 409);
  if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "Paiement en ligne indisponible" }, 501);

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: row.currency.toLowerCase(),
          unit_amount: row.amount_cents,
          product_data: { name: `Bandeau publicitaire — ${row.title}` },
        },
      },
    ],
    metadata: { ad_slot_id: row.id },
    success_url: `${c.env.WEB_BASE_URL}/entreprise/pub?paid=1`,
    cancel_url: `${c.env.WEB_BASE_URL}/entreprise/pub?canceled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  await c.env.DB.prepare("UPDATE ad_slots SET stripe_session_id = ? WHERE id = ?")
    .bind(session.id, row.id)
    .run();
  return c.json({ checkout_url: session.url });
});

/* ------------------------------- Public ------------------------------- */

const publicAds = new Hono<AppContext>();

/** Bandeau homepage : créneaux actifs, filtrés par région détectée (secteur non filtré côté audience). */
publicAds.get("/", async (c) => {
  const now = nowIso();
  const cf = (c.req.raw as Request & { cf?: IncomingRequestCfProperties }).cf;
  const region = typeof cf?.region === "string" ? cf.region : null;
  const rows = await c.env.DB.prepare(
    `SELECT id, title, link_url, sector, region
     FROM ad_slots
     WHERE status = 'active' AND starts_at <= ? AND ends_at >= ?
       AND (region IS NULL OR region = ?)
     ORDER BY RANDOM() LIMIT 12`,
  )
    .bind(now, now, region)
    .all();
  return c.json({ ads: rows.results });
});

/** Créative publicitaire, servie depuis R2 (même pattern que le logo entreprise — id UUID non devinable). */
publicAds.get("/:id/image", async (c) => {
  const row = await c.env.DB.prepare("SELECT image_key, image_type FROM ad_slots WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ image_key: string | null; image_type: string | null }>();
  if (!row?.image_key) return c.json({ error: "Image introuvable" }, 404);
  const wantsThumb = c.req.query("thumb") === "1";
  const thumbKey = `${row.image_key}${THUMB_SUFFIX}`;
  const obj = (wantsThumb ? await c.env.MEDIA.get(thumbKey) : null) ?? (await c.env.MEDIA.get(row.image_key));
  if (!obj) return c.json({ error: "Image introuvable" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": wantsThumb && obj.key === thumbKey ? "image/webp" : (row.image_type ?? "image/png"),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: obj.httpEtag,
    },
  });
});

/** Passe un créneau publicitaire à `active` avec sa fenêtre de diffusion — appelé par le webhook Stripe. */
export async function finalizeAdPayment(env: Env, adSlotId: string): Promise<void> {
  const row = await env.DB.prepare("SELECT weeks, status FROM ad_slots WHERE id = ?")
    .bind(adSlotId)
    .first<{ weeks: number; status: string }>();
  if (!row || row.status !== "pending_payment") return;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + row.weeks * 7 * 24 * 60 * 60 * 1000);
  await env.DB.prepare(
    "UPDATE ad_slots SET status = 'active', starts_at = ?, ends_at = ?, paid_at = ? WHERE id = ?",
  )
    .bind(startsAt.toISOString(), endsAt.toISOString(), nowIso(), adSlotId)
    .run();
}

export { company as adRoutes, publicAds as publicAdRoutes };
