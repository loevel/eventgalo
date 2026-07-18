import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedCategory, seedEvent, seedSession, seedUser } from "./helpers";

describe("POST /api/events/:id/duplicate", () => {
  it("exige une authentification", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const res = await SELF.fetch(`https://api.test/api/events/${eventId}/duplicate`, jsonInit("POST"));
    expect(res.status).toBe(401);
  });

  it("refuse de dupliquer l'événement d'un autre organisateur", async () => {
    const owner = await seedUser();
    const { id: eventId } = await seedEvent(owner.id);
    const intruder = await seedUser();
    const intruderAuth = await seedSession(intruder);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/duplicate`,
      jsonInit("POST", undefined, { Authorization: intruderAuth }),
    );
    expect(res.status).toBe(404);
  });

  it("duplique l'événement et ses catégories, en statut brouillon", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id, { title: "Soirée d'été", status: "published" });
    await seedCategory(eventId, { name: "VIP", quantity: 10, sold: 3, priceCents: 5000 });

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/duplicate`,
      jsonInit("POST", undefined, { Authorization: auth }),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ event: { id: string; title: string; status: string; public_slug: string } }>();
    expect(body.event.id).not.toBe(eventId);
    expect(body.event.title).toBe("Soirée d'été");
    expect(body.event.status).toBe("draft");

    const cats = await env.DB.prepare(
      "SELECT name, quantity, sold, price_cents FROM ticket_categories WHERE event_id = ?",
    )
      .bind(body.event.id)
      .all<{ name: string; quantity: number; sold: number; price_cents: number }>();
    expect(cats.results).toHaveLength(1);
    expect(cats.results[0]).toMatchObject({ name: "VIP", quantity: 10, sold: 0, price_cents: 5000 });
  });
});
