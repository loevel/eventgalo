import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { seedEvent, seedSession, seedUser } from "./helpers";

describe("GET /api/analytics", () => {
  it("exige une authentification", async () => {
    const res = await SELF.fetch("https://api.test/api/analytics");
    expect(res.status).toBe(401);
  });

  it("renvoie un résumé vide sans événement", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const res = await SELF.fetch("https://api.test/api/analytics", { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, any>>();
    expect(body.invites).toEqual({ total: 0, opened: 0 });
    expect(body.vendors).toEqual([]);
    expect(body.revenue_cents).toBe(0);
  });

  it("agrège invitations, RSVP, revenu, présence et vendeurs sur tous les événements", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id, { status: "published" });

    // Invitations + RSVP
    await env.DB.prepare(
      "INSERT INTO guests (id, event_id, name, token, rsvp_status, opened_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), eventId, "Invité Ouvert", `tok-${crypto.randomUUID()}`, "yes", "2026-01-01T00:00:00.000Z")
      .run();
    await env.DB.prepare(
      "INSERT INTO guests (id, event_id, name, token, rsvp_status, opened_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), eventId, "Invité Non Ouvert", `tok-${crypto.randomUUID()}`, "pending", null)
      .run();

    // Billetterie : catégorie, transaction payée, billet scanné
    const categoryId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO ticket_categories (id, event_id, name, price_cents, quantity, sold) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(categoryId, eventId, "Général", 5000, 10, 1)
      .run();
    const sellerId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sellers (id, event_id, name, email, code) VALUES (?, ?, ?, ?, ?)")
      .bind(sellerId, eventId, "Jean Dupont", "jean@example.com", `code-${sellerId.slice(0, 8)}`)
      .run();
    await env.DB.prepare(
      "INSERT INTO seller_quotas (id, seller_id, category_id, quota, sold) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), sellerId, categoryId, 20, 3)
      .run();
    const txId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO transactions (id, event_id, category_id, seller_id, buyer_name, buyer_email, quantity, amount_cents, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 5000, 'paid')`,
    )
      .bind(txId, eventId, categoryId, sellerId, "Acheteur Test", "acheteur@example.com")
      .run();
    await env.DB.prepare(
      `INSERT INTO tickets (id, event_id, category_id, transaction_id, seller_id, buyer_name, buyer_email, serial, status, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'used', ?)`,
    )
      .bind(crypto.randomUUID(), eventId, categoryId, txId, sellerId, "Acheteur Test", "acheteur@example.com", "TESTSERIAL1", new Date().toISOString())
      .run();

    const res = await SELF.fetch("https://api.test/api/analytics", { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, any>>();

    expect(body.invites).toEqual({ total: 2, opened: 1 });
    expect(body.rsvp).toEqual({ yes: 1, no: 0, pending: 1 });
    expect(body.revenue_cents).toBe(5000);
    expect(body.tickets).toEqual({ sold: 1, used: 1 });
    expect(body.vendors).toHaveLength(1);
    expect(body.vendors[0]).toMatchObject({ name: "Jean Dupont", quota: 20, sold: 3, lastAmount: 5000 });
    expect(body.monthly).toHaveLength(6);
  });
});
