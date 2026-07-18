import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedEvent, seedGuest, seedUser } from "./helpers";

describe("POST /api/public/invite/:token/rsvp", () => {
  it("confirme la présence et enregistre la réponse à la question RSVP", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id, { rsvpQuestion: "Allergies ?" });
    const { token } = await seedGuest(eventId);

    const res = await SELF.fetch(
      `https://api.test/api/public/invite/${token}/rsvp`,
      jsonInit("POST", { status: "yes", consent: true, note: "Allergie aux arachides" }),
    );
    expect(res.status).toBe(200);

    const guest = await env.DB.prepare("SELECT rsvp_status, rsvp_note FROM guests WHERE token = ?")
      .bind(token)
      .first<{ rsvp_status: string; rsvp_note: string }>();
    expect(guest?.rsvp_status).toBe("yes");
    expect(guest?.rsvp_note).toBe("Allergie aux arachides");
  });

  it("refuse un statut invalide", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { token } = await seedGuest(eventId);

    const res = await SELF.fetch(
      `https://api.test/api/public/invite/${token}/rsvp`,
      jsonInit("POST", { status: "peut-être" }),
    );
    expect(res.status).toBe(400);
  });

  it("404 pour un token inconnu", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/public/invite/token-inconnu/rsvp",
      jsonInit("POST", { status: "yes" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/public/invite/:token — auto-édition des coordonnées", () => {
  it("permet à l'invité de corriger son nom et son email", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { token } = await seedGuest(eventId, { name: "Nom Erroné" });

    const res = await SELF.fetch(
      `https://api.test/api/public/invite/${token}`,
      jsonInit("PATCH", { name: "Nom Corrigé", email: "corrige@example.com" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ guest: { name: string; email: string } }>();
    expect(body.guest.name).toBe("Nom Corrigé");
    expect(body.guest.email).toBe("corrige@example.com");
  });

  it("rejette un email mal formé", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { token } = await seedGuest(eventId);

    const res = await SELF.fetch(`https://api.test/api/public/invite/${token}`, jsonInit("PATCH", { email: "pas-un-email" }));
    expect(res.status).toBe(400);
  });

  it("rejette un nom vide", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { token } = await seedGuest(eventId);

    const res = await SELF.fetch(`https://api.test/api/public/invite/${token}`, jsonInit("PATCH", { name: "   " }));
    expect(res.status).toBe(400);
  });

  it("404 pour un token inconnu", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/public/invite/token-inconnu",
      jsonInit("PATCH", { name: "Peu importe" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/public/invite/:token/ics", () => {
  it("renvoie un fichier calendrier valide", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id, { title: "Fête de test" });
    const { token } = await seedGuest(eventId);

    const res = await SELF.fetch(`https://api.test/api/public/invite/${token}/ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("SUMMARY:Fête de test");
  });
});
