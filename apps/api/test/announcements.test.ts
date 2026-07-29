import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedCategory, seedEvent, seedGuest, seedSession, seedTicket, seedUser } from "./helpers";

/**
 * La diffusion part via c.executionCtx.waitUntil() : elle peut s'exécuter juste
 * après la réponse HTTP, d'où ce court sondage plutôt qu'une lecture immédiate.
 */
async function waitForDelivery(announcementId: string) {
  let row: { notify: number; recipients_count: number; notified_at: string | null } | null = null;
  for (let i = 0; i < 20; i++) {
    row = await env.DB.prepare("SELECT notify, recipients_count, notified_at FROM announcements WHERE id = ?")
      .bind(announcementId)
      .first<{ notify: number; recipients_count: number; notified_at: string | null }>();
    if (row?.notified_at) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  return row;
}

describe("POST /api/events/:id/announcements", () => {
  it("exige une authentification", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements`,
      jsonInit("POST", { body: "Porte au 1er étage" }),
    );
    expect(res.status).toBe(401);
  });

  it("refuse un message vide", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements`,
      jsonInit("POST", { body: "   " }, { Authorization: auth }),
    );
    expect(res.status).toBe(400);
  });

  it("prévient les invités RSVP et les détenteurs de billets, sans doublon", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);

    await seedGuest(eventId, { name: "Avec courriel", email: "invitee@example.com" });
    await seedGuest(eventId, { name: "Sans courriel", email: null });
    const declined = await seedGuest(eventId, { name: "A décliné", email: "non@example.com" });
    await env.DB.prepare("UPDATE guests SET rsvp_status = 'no' WHERE id = ?").bind(declined.id).run();
    // Même personne invitée et détentrice d'un billet : un seul courriel attendu.
    await seedTicket(eventId, categoryId, { buyerEmail: "INVITEE@example.com", serial: "TKDOUBLON" });
    await seedTicket(eventId, categoryId, { buyerEmail: "acheteur@example.com", serial: "TKA1" });
    // Deux billets pour le même acheteur : un seul courriel.
    await seedTicket(eventId, categoryId, { buyerEmail: "acheteur@example.com", serial: "TKA2" });
    // Billet remboursé : pas de courriel.
    await seedTicket(eventId, categoryId, { buyerEmail: "rembourse@example.com", serial: "TKR1", status: "refunded" });

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements`,
      jsonInit("POST", { body: "La porte d'entrée est au 1er étage." }, { Authorization: auth }),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; notified: number }>();
    expect(body.notified).toBe(2); // invitee@example.com + acheteur@example.com

    const row = await waitForDelivery(body.id);
    expect(row?.notify).toBe(1);
    expect(row?.recipients_count).toBe(2);
    expect(row?.notified_at).not.toBeNull();

    const stored = await env.DB.prepare("SELECT body FROM announcements WHERE id = ?")
      .bind(body.id)
      .first<{ body: string }>();
    expect(stored?.body).toBe("La porte d'entrée est au 1er étage.");
  });

  it("permet de publier sans prévenir personne", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);
    await seedGuest(eventId, { email: "invitee@example.com" });

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements`,
      jsonInit("POST", { body: "Note interne", notify: false }, { Authorization: auth }),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; notified: number }>();
    expect(body.notified).toBe(0);

    const row = await env.DB.prepare("SELECT notify, notified_at FROM announcements WHERE id = ?")
      .bind(body.id)
      .first<{ notify: number; notified_at: string | null }>();
    expect(row?.notify).toBe(0);
    expect(row?.notified_at).toBeNull();
  });

  it("refuse l'annonce sur l'événement d'un autre organisateur", async () => {
    const owner = await seedUser();
    const { id: eventId } = await seedEvent(owner.id);
    const other = await seedUser();
    const auth = await seedSession(other);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements`,
      jsonInit("POST", { body: "Intrus" }, { Authorization: auth }),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/events/:id/announcements/:aid/notify", () => {
  it("renvoie l'annonce aux destinataires actuels", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);

    const created = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements`,
      jsonInit("POST", { body: "Porte au 1er étage", notify: false }, { Authorization: auth }),
    );
    const { id: announcementId } = await created.json<{ id: string }>();

    // Un billet vendu après la publication : il doit recevoir le renvoi.
    await seedTicket(eventId, categoryId, { buyerEmail: "tardif@example.com", serial: "TKLATE" });

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements/${announcementId}/notify`,
      jsonInit("POST", undefined, { Authorization: auth }),
    );
    expect(res.status).toBe(200);
    expect(await res.json<{ notified: number }>()).toEqual({ ok: true, notified: 1 });

    const row = await waitForDelivery(announcementId);
    expect(row?.recipients_count).toBe(1);
    expect(row?.notified_at).not.toBeNull();
  });

  it("renvoie 404 pour une annonce d'un autre événement", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);
    const { id: otherEventId } = await seedEvent(user.id);
    const created = await SELF.fetch(
      `https://api.test/api/events/${otherEventId}/announcements`,
      jsonInit("POST", { body: "Ailleurs", notify: false }, { Authorization: auth }),
    );
    const { id: announcementId } = await created.json<{ id: string }>();

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/announcements/${announcementId}/notify`,
      jsonInit("POST", undefined, { Authorization: auth }),
    );
    expect(res.status).toBe(404);
  });
});
