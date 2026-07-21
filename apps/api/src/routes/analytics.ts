import { Hono } from "hono";
import type { AppContext } from "../types";
import { requireAuth } from "../lib/auth";

const analytics = new Hono<AppContext>();
analytics.use("*", requireAuth);

interface SellerAgg {
  id: string;
  name: string;
  email: string | null;
  quota: number;
  sold: number;
}

interface LastSale {
  seller_id: string;
  amount_cents: number;
  created_at: string;
}

/**
 * Vue d'ensemble multi-événements pour l'organisateur : KPI, tendance mensuelle,
 * répartition RSVP et suivi des vendeurs — tout calculé depuis les tables
 * existantes (guests, transactions, tickets, sponsors, seller_quotas), sans
 * benchmark ni cible inventés (aucune donnée de comparaison externe disponible).
 */
analytics.get("/", async (c) => {
  const user = c.get("user");
  const eventsRes = await c.env.DB.prepare(
    `SELECT id FROM events e
     WHERE e.organizer_id = ? OR EXISTS (
       SELECT 1 FROM event_collaborators col WHERE col.event_id = e.id AND col.user_id = ?
     )`,
  )
    .bind(user.id, user.id)
    .all<{ id: string }>();
  const eventIds = eventsRes.results.map((r) => r.id);

  if (eventIds.length === 0) {
    return c.json({
      currency: "CAD",
      invites: { total: 0, opened: 0 },
      rsvp: { yes: 0, no: 0, pending: 0 },
      revenue_cents: 0,
      tickets: { sold: 0, used: 0 },
      monthly: [],
      vendors: [],
    });
  }

  const ph = eventIds.map(() => "?").join(",");

  const [invites, rsvp, ticketRevenue, sponsorRevenue, tickets, sellerRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened
       FROM guests WHERE event_id IN (${ph})`,
    )
      .bind(...eventIds)
      .first<{ total: number; opened: number }>(),
    c.env.DB.prepare(
      `SELECT rsvp_status, COUNT(*) AS n FROM guests WHERE event_id IN (${ph}) GROUP BY rsvp_status`,
    )
      .bind(...eventIds)
      .all<{ rsvp_status: string; n: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS total FROM transactions
       WHERE event_id IN (${ph}) AND status = 'paid'`,
    )
      .bind(...eventIds)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS total FROM sponsors
       WHERE event_id IN (${ph}) AND status = 'confirmed'`,
    )
      .bind(...eventIds)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status IN ('valid','used') THEN 1 ELSE 0 END) AS sold,
         SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used
       FROM tickets WHERE event_id IN (${ph})`,
    )
      .bind(...eventIds)
      .first<{ sold: number; used: number }>(),
    c.env.DB.prepare(
      `SELECT s.id, s.name, s.email,
         COALESCE(SUM(q.quota), 0) AS quota, COALESCE(SUM(q.sold), 0) AS sold
       FROM sellers s LEFT JOIN seller_quotas q ON q.seller_id = s.id
       WHERE s.event_id IN (${ph})
       GROUP BY s.id`,
    )
      .bind(...eventIds)
      .all<SellerAgg>(),
  ]);

  const rsvpCounts = { yes: 0, no: 0, pending: 0 };
  for (const r of rsvp.results) {
    if (r.rsvp_status in rsvpCounts) rsvpCounts[r.rsvp_status as keyof typeof rsvpCounts] = r.n;
  }

  // Tendance mensuelle (6 derniers mois) : revenu billetterie payé + présences scannées.
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 5);
  since.setUTCDate(1);
  const sinceIso = since.toISOString();
  const [monthlyRevenueRows, monthlyAttendanceRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COALESCE(SUM(amount_cents), 0) AS revenue
       FROM transactions WHERE event_id IN (${ph}) AND status = 'paid' AND created_at >= ?
       GROUP BY month`,
    )
      .bind(...eventIds, sinceIso)
      .all<{ month: string; revenue: number }>(),
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m', used_at) AS month, COUNT(*) AS n
       FROM tickets WHERE event_id IN (${ph}) AND status = 'used' AND used_at >= ?
       GROUP BY month`,
    )
      .bind(...eventIds, sinceIso)
      .all<{ month: string; n: number }>(),
  ]);
  const revenueByMonth = new Map(monthlyRevenueRows.results.map((r) => [r.month, r.revenue]));
  const attendanceByMonth = new Map(monthlyAttendanceRows.results.map((r) => [r.month, r.n]));
  const monthly: Array<{ month: string; revenue_cents: number; attendance: number }> = [];
  const cursor = new Date(since);
  for (let i = 0; i < 6; i++) {
    const key = cursor.toISOString().slice(0, 7);
    monthly.push({
      month: key,
      revenue_cents: revenueByMonth.get(key) ?? 0,
      attendance: attendanceByMonth.get(key) ?? 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  // Dernière vente par vendeur (fenêtre SQL : un seul aller-retour pour tous les vendeurs).
  const sellerIds = sellerRows.results.map((s) => s.id);
  let lastSales: LastSale[] = [];
  if (sellerIds.length > 0) {
    const sph = sellerIds.map(() => "?").join(",");
    const lastSalesRes = await c.env.DB.prepare(
      `SELECT seller_id, amount_cents, created_at FROM (
         SELECT seller_id, amount_cents, created_at,
           ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY created_at DESC) AS rn
         FROM transactions WHERE seller_id IN (${sph}) AND status = 'paid'
       ) WHERE rn = 1`,
    )
      .bind(...sellerIds)
      .all<LastSale>();
    lastSales = lastSalesRes.results;
  }
  const lastSaleBySeller = new Map(lastSales.map((r) => [r.seller_id, r]));

  // Regroupement des vendeurs par email (identité récurrente à travers les événements) ;
  // sans email, chaque ligne reste distincte (fallback sur l'id du vendeur).
  const vendorGroups = new Map<
    string,
    { name: string; quota: number; sold: number; lastAt: string | null; lastAmount: number }
  >();
  for (const s of sellerRows.results) {
    const key = s.email && s.email.trim() ? s.email.trim().toLowerCase() : `id:${s.id}`;
    const last = lastSaleBySeller.get(s.id);
    const group = vendorGroups.get(key);
    if (!group) {
      vendorGroups.set(key, {
        name: s.name,
        quota: s.quota,
        sold: s.sold,
        lastAt: last?.created_at ?? null,
        lastAmount: last?.amount_cents ?? 0,
      });
    } else {
      group.quota += s.quota;
      group.sold += s.sold;
      if (last && (!group.lastAt || last.created_at > group.lastAt)) {
        group.lastAt = last.created_at;
        group.lastAmount = last.amount_cents;
      }
    }
  }
  const vendors = [...vendorGroups.values()]
    .filter((v) => v.quota > 0)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 10);

  return c.json({
    currency: "CAD",
    invites: { total: invites?.total ?? 0, opened: invites?.opened ?? 0 },
    rsvp: rsvpCounts,
    revenue_cents: (ticketRevenue?.total ?? 0) + (sponsorRevenue?.total ?? 0),
    tickets: { sold: tickets?.sold ?? 0, used: tickets?.used ?? 0 },
    monthly,
    vendors,
  });
});

export { analytics as analyticsRoutes };
