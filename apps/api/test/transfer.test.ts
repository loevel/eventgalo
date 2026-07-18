import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedCategory, seedEvent, seedTicket, seedUser } from "./helpers";

describe("PATCH /api/public/tickets/:serial/transfer", () => {
  it("refuse si l'email ne correspond pas à l'acheteur", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);
    const { serial } = await seedTicket(eventId, categoryId, { buyerEmail: "acheteur@example.com" });

    const res = await SELF.fetch(
      `https://api.test/api/public/tickets/${serial}/transfer`,
      jsonInit("PATCH", { email: "pas-le-bon@example.com", new_name: "Nouvelle Personne", new_email: "nouveau@example.com" }),
    );
    expect(res.status).toBe(403);
  });

  it("refuse de transférer un billet déjà utilisé", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);
    const { serial } = await seedTicket(eventId, categoryId, { buyerEmail: "acheteur@example.com", status: "used" });

    const res = await SELF.fetch(
      `https://api.test/api/public/tickets/${serial}/transfer`,
      jsonInit("PATCH", { email: "acheteur@example.com", new_name: "Nouvelle Personne", new_email: "nouveau@example.com" }),
    );
    expect(res.status).toBe(409);
  });

  it("transfère un billet valide au nouveau titulaire", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id, { type: "ticketed", title: "Concert" });
    const { id: categoryId } = await seedCategory(eventId);
    const { id: ticketId, serial } = await seedTicket(eventId, categoryId, {
      buyerName: "Ancien Titulaire",
      buyerEmail: "ancien@example.com",
    });

    const res = await SELF.fetch(
      `https://api.test/api/public/tickets/${serial}/transfer`,
      jsonInit("PATCH", { email: "ancien@example.com", new_name: "Nouveau Titulaire", new_email: "nouveau@example.com" }),
    );
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT buyer_name, buyer_email FROM tickets WHERE id = ?")
      .bind(ticketId)
      .first<{ buyer_name: string; buyer_email: string }>();
    expect(row?.buyer_name).toBe("Nouveau Titulaire");
    expect(row?.buyer_email).toBe("nouveau@example.com");
  });

  it("refuse de se transférer un billet à soi-même", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);
    const { serial } = await seedTicket(eventId, categoryId, { buyerEmail: "moi@example.com" });

    const res = await SELF.fetch(
      `https://api.test/api/public/tickets/${serial}/transfer`,
      jsonInit("PATCH", { email: "moi@example.com", new_name: "Moi", new_email: "moi@example.com" }),
    );
    expect(res.status).toBe(400);
  });
});
