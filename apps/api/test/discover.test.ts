import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { seedCategory, seedEvent, seedTicket, seedSession, seedUser } from "./helpers";

interface DiscoverEvent {
  title: string;
  public_slug: string;
  community_tag: string | null;
  min_price_cents: number | null;
  seats_left: number;
}

async function discover(query = ""): Promise<{ events: DiscoverEvent[]; total: number }> {
  const res = await SELF.fetch(`https://api.test/api/public/discover${query}`);
  expect(res.status).toBe(200);
  return res.json();
}

/** `seedEvent` place les événements en 2027 : ils sont donc « à venir ». */
async function seedPastEvent(organizerId: string, title: string) {
  const { id } = await seedEvent(organizerId, { title });
  await env.DB.prepare("UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?")
    .bind("2020-01-01T20:00:00.000Z", "2020-01-01T23:00:00.000Z", id)
    .run();
  return id;
}

describe("GET /api/public/discover", () => {
  it("liste les événements publiés à venir", async () => {
    const organizer = await seedUser();
    const { slug } = await seedEvent(organizer.id, { title: "Gala des Lumières" });

    const data = await discover();
    expect(data.events.some((e) => e.public_slug === slug)).toBe(true);
  });

  it("exclut les brouillons et les événements passés", async () => {
    const organizer = await seedUser();
    const { slug: draftSlug } = await seedEvent(organizer.id, { title: "Brouillon", status: "draft" });
    const pastId = await seedPastEvent(organizer.id, "Soirée de 2020");
    const past = await env.DB.prepare("SELECT public_slug FROM events WHERE id = ?")
      .bind(pastId)
      .first<{ public_slug: string }>();

    const data = await discover();
    const slugs = data.events.map((e) => e.public_slug);
    expect(slugs).not.toContain(draftSlug);
    expect(slugs).not.toContain(past!.public_slug);
  });

  it("filtre par recherche texte sur le titre", async () => {
    const organizer = await seedUser();
    const { slug } = await seedEvent(organizer.id, { title: "Nuit Bamiléké Montréal" });

    const data = await discover("?q=Bamil");
    expect(data.events.map((e) => e.public_slug)).toContain(slug);

    const none = await discover("?q=zzzzzintrouvable");
    expect(none.events).toHaveLength(0);
    expect(none.total).toBe(0);
  });

  it("filtre par étiquette de communauté", async () => {
    const organizer = await seedUser();
    const { id, slug } = await seedEvent(organizer.id, { title: "Gala étiqueté" });
    await env.DB.prepare("UPDATE events SET community_tag = ? WHERE id = ?").bind("Diaspora test", id).run();

    const data = await discover("?tag=Diaspora%20test");
    expect(data.events.map((e) => e.public_slug)).toContain(slug);
    expect(data.events.every((e) => e.community_tag === "Diaspora test")).toBe(true);
  });

  it("expose le prix d'entrée et les places restantes", async () => {
    const organizer = await seedUser();
    const { id, slug } = await seedEvent(organizer.id, { title: "Gala tarifé", type: "ticketed" });
    await seedCategory(id, { priceCents: 5000, quantity: 10, sold: 8 });
    await seedCategory(id, { priceCents: 12000, quantity: 5, sold: 0 });

    const data = await discover("?q=Gala%20tarif");
    const found = data.events.find((e) => e.public_slug === slug);
    expect(found?.min_price_cents).toBe(5000);
    expect(found?.seats_left).toBe(7); // (10-8) + (5-0)
  });

  it("ne retient que les événements entièrement gratuits avec free=1", async () => {
    const organizer = await seedUser();
    const { id: paidId, slug: paidSlug } = await seedEvent(organizer.id, { title: "Payant", type: "ticketed" });
    await seedCategory(paidId, { priceCents: 4000 });
    const { id: freeId, slug: freeSlug } = await seedEvent(organizer.id, { title: "Gratuit", type: "ticketed" });
    await seedCategory(freeId, { priceCents: 0 });

    const data = await discover("?free=1");
    const slugs = data.events.map((e) => e.public_slug);
    expect(slugs).toContain(freeSlug);
    expect(slugs).not.toContain(paidSlug);
  });
});

describe("GET /api/public/events/:slug/similar", () => {
  it("ne se suggère jamais lui-même", async () => {
    const organizer = await seedUser();
    const { slug } = await seedEvent(organizer.id, { title: "Événement courant" });
    await seedEvent(organizer.id, { title: "Un autre" });

    const res = await SELF.fetch(`https://api.test/api/public/events/${slug}/similar`);
    const data = await res.json<{ events: Array<{ public_slug: string }> }>();
    expect(data.events.map((e) => e.public_slug)).not.toContain(slug);
  });

  it("répond une liste vide pour un slug inconnu, sans erreur", async () => {
    const res = await SELF.fetch("https://api.test/api/public/events/slug-inexistant/similar");
    expect(res.status).toBe(200);
    expect((await res.json<{ events: unknown[] }>()).events).toEqual([]);
  });
});

describe("GET /api/me/tickets", () => {
  it("exige une session", async () => {
    const res = await SELF.fetch("https://api.test/api/me/tickets");
    expect(res.status).toBe(401);
  });

  it("retrouve les billets par l'adresse email du compte", async () => {
    const buyer = await seedUser({ email: "acheteuse@example.com" });
    const authorization = await seedSession(buyer);
    const organizer = await seedUser();
    const { id: eventId } = await seedEvent(organizer.id, { title: "Gala à venir", type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);
    const { serial } = await seedTicket(eventId, categoryId, { buyerEmail: "acheteuse@example.com" });
    await seedTicket(eventId, categoryId, { buyerEmail: "quelquun.dautre@example.com" });

    const res = await SELF.fetch("https://api.test/api/me/tickets", { headers: { authorization } });
    const data = await res.json<{ upcoming: Array<{ serial: string }>; past: unknown[] }>();
    expect(data.upcoming.map((t) => t.serial)).toEqual([serial]);
  });

  it("sépare les événements passés des événements à venir", async () => {
    const buyer = await seedUser({ email: "passee@example.com" });
    const authorization = await seedSession(buyer);
    const organizer = await seedUser();
    const eventId = await seedPastEvent(organizer.id, "Gala de 2020");
    const { id: categoryId } = await seedCategory(eventId);
    await seedTicket(eventId, categoryId, { buyerEmail: "passee@example.com" });

    const res = await SELF.fetch("https://api.test/api/me/tickets", { headers: { authorization } });
    const data = await res.json<{ upcoming: unknown[]; past: unknown[] }>();
    expect(data.upcoming).toHaveLength(0);
    expect(data.past).toHaveLength(1);
  });
});
