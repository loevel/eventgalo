import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { callEventDO } from "../src/do/event-do";
import { seedCategory, seedEvent, seedUser } from "./helpers";

/**
 * Le Durable Object ne stocke rien localement : tout son état vit dans D1. Ces
 * tests couvrent les garde-fous qui remplacent la sérialisation qu'on croyait
 * acquise — écritures conditionnelles vérifiées via `meta.changes`.
 */

async function seedTicketed(quantity = 10) {
  const organizer = await seedUser();
  const { id: eventId } = await seedEvent(organizer.id, { type: "ticketed" });
  const { id: categoryId } = await seedCategory(eventId, { quantity, priceCents: 0 });
  return { eventId, categoryId };
}

async function reserve(eventId: string, categoryId: string, quantity: number) {
  return callEventDO<{ transaction_id: string }>(env, eventId, {
    action: "reserve",
    event_id: eventId,
    category_id: categoryId,
    quantity,
    buyer_name: "Ada Lovelace",
    buyer_email: "ada@example.com",
    consent: true,
  });
}

async function soldCount(categoryId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT sold FROM ticket_categories WHERE id = ?")
    .bind(categoryId)
    .first<{ sold: number }>();
  return row!.sold;
}

describe("EventDO — finalize", () => {
  it("n'émet qu'un seul jeu de billets même si le webhook Stripe est rejoué", async () => {
    const { eventId, categoryId } = await seedTicketed();
    const { transaction_id } = await reserve(eventId, categoryId, 3);

    // Deux livraisons concurrentes du même `checkout.session.completed`.
    const [first, second] = await Promise.all([
      callEventDO<{ tickets: unknown[] }>(env, eventId, { action: "finalize", transaction_id }),
      callEventDO<{ tickets: unknown[] }>(env, eventId, { action: "finalize", transaction_id }),
    ]);

    expect(first.tickets).toHaveLength(3);
    expect(second.tickets).toHaveLength(3);

    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE transaction_id = ?")
      .bind(transaction_id)
      .first<{ n: number }>();
    expect(total!.n).toBe(3);
  });

  it("reste idempotent sur un rejeu tardif, après émission", async () => {
    const { eventId, categoryId } = await seedTicketed();
    const { transaction_id } = await reserve(eventId, categoryId, 2);

    await callEventDO(env, eventId, { action: "finalize", transaction_id });
    const replay = await callEventDO<{ tickets: unknown[] }>(env, eventId, { action: "finalize", transaction_id });

    expect(replay.tickets).toHaveLength(2);
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE transaction_id = ?")
      .bind(transaction_id)
      .first<{ n: number }>();
    expect(total!.n).toBe(2);
  });
});

describe("EventDO — cancel", () => {
  it("ne décrémente le stock qu'une fois, même appelé deux fois", async () => {
    const { eventId, categoryId } = await seedTicketed();
    const { transaction_id } = await reserve(eventId, categoryId, 4);
    expect(await soldCount(categoryId)).toBe(4);

    // Webhook `expired` et balayage des paniers morts peuvent se croiser.
    await Promise.all([
      callEventDO(env, eventId, { action: "cancel", transaction_id }),
      callEventDO(env, eventId, { action: "cancel", transaction_id }),
    ]);

    expect(await soldCount(categoryId)).toBe(0);
  });
});

describe("EventDO — reserve", () => {
  it("refuse au-delà du stock avec un message métier, pas une erreur SQL", async () => {
    const { eventId, categoryId } = await seedTicketed(3);
    await reserve(eventId, categoryId, 3);

    await expect(reserve(eventId, categoryId, 1)).rejects.toThrow(/Plus assez de places/);
    expect(await soldCount(categoryId)).toBe(3);
  });

  it("ne laisse pas de transaction fantôme quand la réservation est refusée", async () => {
    const { eventId, categoryId } = await seedTicketed(2);
    await reserve(eventId, categoryId, 2);
    await expect(reserve(eventId, categoryId, 1)).rejects.toThrow();

    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM transactions WHERE event_id = ? AND status = 'pending'",
    )
      .bind(eventId)
      .first<{ n: number }>();
    // Seule la réservation acceptée reste en attente de paiement.
    expect(pending!.n).toBe(1);
  });
});

describe("EventDO — refund_ticket", () => {
  it("ne rend la place qu'une fois sur deux approbations concurrentes", async () => {
    const { eventId, categoryId } = await seedTicketed();
    const { transaction_id } = await reserve(eventId, categoryId, 2);
    const { tickets } = await callEventDO<{ tickets: Array<{ id: string }> }>(env, eventId, {
      action: "finalize",
      transaction_id,
    });
    expect(await soldCount(categoryId)).toBe(2);

    const ticketId = tickets[0].id;
    const outcomes = await Promise.allSettled([
      callEventDO(env, eventId, { action: "refund_ticket", ticket_id: ticketId }),
      callEventDO(env, eventId, { action: "refund_ticket", ticket_id: ticketId }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await soldCount(categoryId)).toBe(1);
  });
});
