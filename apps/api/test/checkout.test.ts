import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { jsonInit, seedCategory, seedEvent, seedUser } from "./helpers";

async function seedTicketedEventWithCategory(organizerId: string, priceCents = 0) {
  const { id: eventId, slug } = await seedEvent(organizerId, { type: "ticketed" });
  const { id: categoryId } = await seedCategory(eventId, { priceCents, quantity: 10 });
  return { eventId, slug, categoryId };
}

describe("POST /api/public/checkout", () => {
  it("rejette une requête sans nom d'acheteur avec le même message que l'email invalide", async () => {
    const organizer = await seedUser();
    const { slug, categoryId } = await seedTicketedEventWithCategory(organizer.id);

    const res = await SELF.fetch(
      "https://api.test/api/public/checkout",
      jsonInit("POST", {
        slug,
        category_id: categoryId,
        buyer_name: "",
        buyer_email: "pas-un-email",
        consent: true,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Nom et email de l'acheteur requis");
  });

  it("rejette un email malformé avec le même message que le nom manquant", async () => {
    const organizer = await seedUser();
    const { slug, categoryId } = await seedTicketedEventWithCategory(organizer.id);

    const res = await SELF.fetch(
      "https://api.test/api/public/checkout",
      jsonInit("POST", {
        slug,
        category_id: categoryId,
        buyer_name: "Ada Lovelace",
        buyer_email: "pas-un-email",
        consent: true,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Nom et email de l'acheteur requis");
  });

  it("rejette une requête sans consentement", async () => {
    const organizer = await seedUser();
    const { slug, categoryId } = await seedTicketedEventWithCategory(organizer.id);

    const res = await SELF.fetch(
      "https://api.test/api/public/checkout",
      jsonInit("POST", {
        slug,
        category_id: categoryId,
        buyer_name: "Ada Lovelace",
        buyer_email: "ada@example.com",
        consent: false,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Le consentement à la collecte des données est requis");
  });

  it("émet un billet gratuit quand la requête est valide", async () => {
    const organizer = await seedUser();
    const { slug, categoryId } = await seedTicketedEventWithCategory(organizer.id, 0);

    const res = await SELF.fetch(
      "https://api.test/api/public/checkout",
      jsonInit("POST", {
        slug,
        category_id: categoryId,
        quantity: 1,
        buyer_name: "Ada Lovelace",
        buyer_email: "Ada@Example.com",
        consent: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ mode: string; tickets: Array<{ serial: string; url: string }> }>();
    expect(body.mode).toBe("direct");
    expect(body.tickets).toHaveLength(1);
  });
});
