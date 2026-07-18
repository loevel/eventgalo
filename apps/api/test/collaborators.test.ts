import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedEvent, seedSession, seedUser } from "./helpers";

describe("POST /api/events/:id/collaborators", () => {
  it("exige une authentification", async () => {
    const owner = await seedUser();
    const { id: eventId } = await seedEvent(owner.id);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators`,
      jsonInit("POST", { email: "co@example.com" }),
    );
    expect(res.status).toBe(401);
  });

  it("refuse qu'un tiers non lié à l'événement ajoute un co-organisateur", async () => {
    const owner = await seedUser();
    const { id: eventId } = await seedEvent(owner.id);
    const intruder = await seedUser();
    const intruderAuth = await seedSession(intruder);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators`,
      jsonInit("POST", { email: "co@example.com" }, { Authorization: intruderAuth }),
    );
    expect(res.status).toBe(404);
  });

  it("ajoute un co-organisateur (nouveau compte créé) et lui donne accès à l'événement", async () => {
    const owner = await seedUser();
    const ownerAuth = await seedSession(owner);
    const { id: eventId } = await seedEvent(owner.id, { title: "Anniversaire" });

    const addRes = await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators`,
      jsonInit("POST", { email: "co-organisatrice@example.com" }, { Authorization: ownerAuth }),
    );
    expect(addRes.status).toBe(201);

    const collabRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind("co-organisatrice@example.com")
      .first<{ id: string }>();
    expect(collabRow).not.toBeNull();
    const collabAuth = await seedSession({ id: collabRow!.id, email: "co-organisatrice@example.com", name: null });

    const getRes = await SELF.fetch(`https://api.test/api/events/${eventId}`, jsonInit("GET", undefined, { Authorization: collabAuth }));
    expect(getRes.status).toBe(200);
    const body = await getRes.json<{ event: { title: string }; is_owner: boolean }>();
    expect(body.event.title).toBe("Anniversaire");
    expect(body.is_owner).toBe(false);
  });

  it("refuse qu'un co-organisateur (non propriétaire) ajoute quelqu'un d'autre", async () => {
    const owner = await seedUser();
    const ownerAuth = await seedSession(owner);
    const { id: eventId } = await seedEvent(owner.id);
    await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators`,
      jsonInit("POST", { email: "co1@example.com" }, { Authorization: ownerAuth }),
    );
    const collabRow = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind("co1@example.com")
      .first<{ id: string }>();
    const collabAuth = await seedSession({ id: collabRow!.id, email: "co1@example.com", name: null });

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators`,
      jsonInit("POST", { email: "co2@example.com" }, { Authorization: collabAuth }),
    );
    expect(res.status).toBe(403);
  });

  it("permet au propriétaire de retirer un co-organisateur", async () => {
    const owner = await seedUser();
    const ownerAuth = await seedSession(owner);
    const { id: eventId } = await seedEvent(owner.id);
    const addRes = await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators`,
      jsonInit("POST", { email: "co@example.com" }, { Authorization: ownerAuth }),
    );
    const { id: collabId } = await addRes.json<{ id: string }>();

    const delRes = await SELF.fetch(
      `https://api.test/api/events/${eventId}/collaborators/${collabId}`,
      jsonInit("DELETE", undefined, { Authorization: ownerAuth }),
    );
    expect(delRes.status).toBe(200);

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM event_collaborators WHERE event_id = ?")
      .bind(eventId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});
