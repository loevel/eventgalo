import { Hono } from "hono";
import type { AppContext } from "../types";
import { requireAuth } from "../lib/auth";
import { requireAdmin, requireSuperadmin, logAdminAction, getSetting, setSetting } from "../lib/admin";
import { nowIso } from "../lib/crypto";

const admin = new Hono<AppContext>();
admin.use("*", requireAuth, requireAdmin);

function page(c: { req: { query: (k: string) => string | undefined } }) {
  const p = Math.max(1, Number(c.req.query("page") ?? "1") | 0);
  const limit = 30;
  return { limit, offset: (p - 1) * limit };
}

/** Vue d'ensemble : KPIs globaux de la plateforme. */
admin.get("/overview", async (c) => {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [events, eventsThisMonth, users, companies, sales, connect] = await Promise.all([
    c.env.DB.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published FROM events",
    ).first<{ total: number; published: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE created_at >= ?").bind(monthStart.toISOString()).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended FROM users",
    ).first<{ total: number; suspended: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM companies").first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS tx, COALESCE(SUM(amount_cents),0) AS gmv, COALESCE(SUM(service_fee_cents),0) AS fees,
              COALESCE(SUM(quantity),0) AS tickets
       FROM transactions WHERE status = 'paid'`,
    ).first<{ tx: number; gmv: number; fees: number; tickets: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN stripe_charges_enabled = 1 THEN 1 ELSE 0 END) AS enabled
       FROM users WHERE stripe_account_id IS NOT NULL`,
    ).first<{ total: number; enabled: number }>(),
  ]);

  return c.json({
    events: { total: events?.total ?? 0, published: events?.published ?? 0, this_month: eventsThisMonth?.n ?? 0 },
    users: { total: users?.total ?? 0, suspended: users?.suspended ?? 0 },
    companies: { total: companies?.n ?? 0 },
    sales: {
      paid_transactions: sales?.tx ?? 0,
      gmv_cents: sales?.gmv ?? 0,
      platform_fees_cents: sales?.fees ?? 0,
      tickets_sold: sales?.tickets ?? 0,
    },
    connect: { accounts_started: connect?.total ?? 0, accounts_enabled: connect?.enabled ?? 0 },
  });
});

/** Recherche/liste des comptes utilisateurs. */
admin.get("/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const { limit, offset } = page(c);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    conditions.push("(u.email LIKE ? OR u.name LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.suspended_at, u.suspended_reason,
            (SELECT COUNT(*) FROM events e WHERE e.organizer_id = u.id) AS events_count
     FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();
  return c.json({ users: rows.results });
});

/** Détail d'un compte : profil, événements organisés, transactions récentes en tant qu'acheteur. */
admin.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const user = await c.env.DB.prepare(
    `SELECT id, email, name, role, status, created_at, suspended_at, suspended_reason,
            stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled
     FROM users WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!user) return c.json({ error: "Introuvable" }, 404);
  const events = await c.env.DB.prepare(
    "SELECT id, title, status, starts_at, public_slug FROM events WHERE organizer_id = ? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(id)
    .all();
  return c.json({ user, events: events.results });
});

/** Suspend un compte : bloque toute nouvelle connexion (les sessions déjà émises expirent naturellement). */
admin.post("/users/:id/suspend", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}) as Record<string, never>);
  const admin_ = c.get("user");
  if (id === admin_.id) return c.json({ error: "Vous ne pouvez pas suspendre votre propre compte" }, 400);
  const result = await c.env.DB.prepare(
    "UPDATE users SET status = 'suspended', suspended_at = ?, suspended_reason = ? WHERE id = ?",
  )
    .bind(nowIso(), body.reason ?? null, id)
    .run();
  if (!result.meta.changes) return c.json({ error: "Introuvable" }, 404);
  await logAdminAction(c.env, admin_.id, "user.suspend", "user", id, { reason: body.reason ?? null });
  return c.json({ ok: true });
});

admin.post("/users/:id/reactivate", async (c) => {
  const id = c.req.param("id");
  const admin_ = c.get("user");
  const result = await c.env.DB.prepare(
    "UPDATE users SET status = 'active', suspended_at = NULL, suspended_reason = NULL WHERE id = ?",
  )
    .bind(id)
    .run();
  if (!result.meta.changes) return c.json({ error: "Introuvable" }, 404);
  await logAdminAction(c.env, admin_.id, "user.reactivate", "user", id);
  return c.json({ ok: true });
});

/** Promotion/rétrogradation de rôle — réservé au super-administrateur. */
admin.post("/users/:id/role", requireSuperadmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ role?: string }>().catch(() => ({}) as Record<string, never>);
  if (!["user", "admin", "superadmin"].includes(body.role ?? "")) {
    return c.json({ error: "Rôle invalide" }, 400);
  }
  const admin_ = c.get("user");
  if (id === admin_.id) return c.json({ error: "Vous ne pouvez pas modifier votre propre rôle" }, 400);
  const result = await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(body.role, id).run();
  if (!result.meta.changes) return c.json({ error: "Introuvable" }, 404);
  await logAdminAction(c.env, admin_.id, "user.role", "user", id ?? null, { role: body.role ?? null });
  return c.json({ ok: true });
});

/** Liste globale des événements, tous organisateurs confondus. */
admin.get("/events", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const status = c.req.query("status");
  const { limit, offset } = page(c);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    conditions.push("(e.title LIKE ? OR u.email LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (status && ["draft", "published", "archived"].includes(status)) {
    conditions.push("e.status = ?");
    binds.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.status, e.type, e.starts_at, e.capacity, e.public_slug, e.created_at,
            u.id AS organizer_id, u.email AS organizer_email, u.name AS organizer_name,
            (SELECT COALESCE(SUM(quantity),0) FROM transactions t WHERE t.event_id = e.id AND t.status = 'paid') AS tickets_sold
     FROM events e JOIN users u ON u.id = e.organizer_id
     ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();
  return c.json({ events: rows.results });
});

/** Bascule administrative du statut d'un événement (modération). */
admin.post("/events/:id/status", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ status?: string }>().catch(() => ({}) as Record<string, never>);
  if (!["draft", "published", "archived"].includes(body.status ?? "")) {
    return c.json({ error: "Statut invalide" }, 400);
  }
  const admin_ = c.get("user");
  const result = await c.env.DB.prepare("UPDATE events SET status = ?, updated_at = ? WHERE id = ?")
    .bind(body.status, nowIso(), id)
    .run();
  if (!result.meta.changes) return c.json({ error: "Introuvable" }, 404);
  await logAdminAction(c.env, admin_.id, "event.status", "event", id, { status: body.status });
  return c.json({ ok: true });
});

/** Transactions plateforme, tous événements confondus. */
admin.get("/transactions", async (c) => {
  const status = c.req.query("status");
  const { limit, offset } = page(c);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (status && ["pending", "paid", "refunded", "canceled"].includes(status)) {
    conditions.push("t.status = ?");
    binds.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.buyer_name, t.buyer_email, t.quantity, t.amount_cents, t.service_fee_cents, t.currency,
            t.status, t.created_at, t.stripe_destination_account,
            e.id AS event_id, e.title AS event_title, u.email AS organizer_email
     FROM transactions t JOIN events e ON e.id = t.event_id JOIN users u ON u.id = e.organizer_id
     ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();
  return c.json({ transactions: rows.results });
});

/** Comptes Stripe Connect des organisateurs. */
admin.get("/connect-accounts", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, email, name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted
     FROM users WHERE stripe_account_id IS NOT NULL ORDER BY stripe_details_submitted ASC, email ASC`,
  ).all();
  return c.json({ accounts: rows.results });
});

/** Paramètres de la plateforme (frais de service, etc). */
admin.get("/settings", async (c) => {
  const [percent, fixed] = await Promise.all([
    getSetting(c.env, "platform_fee_percent"),
    getSetting(c.env, "platform_fee_fixed_cents"),
  ]);
  return c.json({ settings: { platform_fee_percent: percent, platform_fee_fixed_cents: fixed } });
});

admin.patch("/settings", async (c) => {
  const body = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
  const admin_ = c.get("user");
  const allowed = ["platform_fee_percent", "platform_fee_fixed_cents"];
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0) return c.json({ error: `Valeur invalide pour ${key}` }, 400);
    await setSetting(c.env, key, String(n), admin_.id);
  }
  await logAdminAction(c.env, admin_.id, "settings.update", "platform_settings", null, body);
  return c.json({ ok: true });
});

/** Avis sponsors (organisateur ⇄ entreprise), pour modération des litiges. */
admin.get("/reviews", async (c) => {
  const onlyLow = c.req.query("low") === "1";
  const { limit, offset } = page(c);
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.sponsor_id, r.rated_by, r.rating, r.comment, r.created_at,
            s.company_name AS sponsor_company_name, co.id AS company_id, co.name AS company_name,
            e.title AS event_title, e.public_slug, u.email AS organizer_email
     FROM sponsor_reviews r
     JOIN sponsors s ON s.id = r.sponsor_id
     JOIN events e ON e.id = s.event_id
     JOIN users u ON u.id = e.organizer_id
     LEFT JOIN companies co ON co.id = s.company_id
     ${onlyLow ? "WHERE r.rating <= 2" : ""}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all();
  return c.json({ reviews: rows.results });
});

/** Supprime un avis litigieux (visible publiquement sur le profil de l'entreprise notée). */
admin.delete("/reviews/:id", async (c) => {
  const id = c.req.param("id");
  const admin_ = c.get("user");
  const review = await c.env.DB.prepare("SELECT id, sponsor_id, rated_by, rating FROM sponsor_reviews WHERE id = ?")
    .bind(id)
    .first<{ id: string; sponsor_id: string; rated_by: string; rating: number }>();
  if (!review) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM sponsor_reviews WHERE id = ?").bind(id).run();
  await logAdminAction(c.env, admin_.id, "review.delete", "sponsor_review", id, {
    rated_by: review.rated_by,
    rating: review.rating,
  });
  return c.json({ ok: true });
});

/** Journal d'audit des actions administratives. */
admin.get("/audit-log", async (c) => {
  const { limit, offset } = page(c);
  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, u.email AS admin_email
     FROM admin_audit_log l JOIN users u ON u.id = l.admin_id
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all();
  return c.json({ entries: rows.results });
});

export default admin;
