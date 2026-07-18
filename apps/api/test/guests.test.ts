import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedEvent, seedSession, seedUser } from "./helpers";

describe("POST /api/events/:id/guests", () => {
  it("exige une authentification", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/guests`,
      jsonInit("POST", { guests: [{ name: "Sans Session" }] }),
    );
    expect(res.status).toBe(401);
  });

  it("importe une liste d'invités avec contact parent/tuteur", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/guests`,
      jsonInit(
        "POST",
        {
          guests: [
            { name: "Léa Martin", email: "maman.lea@example.com", guardian_name: "Sophie Martin (maman)" },
            { name: "Noah Petit" },
          ],
        },
        { Authorization: auth },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ guests: Array<{ name: string; guardian_name: string | null }> }>();
    expect(body.guests).toHaveLength(2);
    const lea = body.guests.find((g) => g.name === "Léa Martin");
    expect(lea?.guardian_name).toBe("Sophie Martin (maman)");

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM guests WHERE event_id = ?")
      .bind(eventId)
      .first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  it("refuse une liste vide", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/guests`,
      jsonInit("POST", { guests: [] }, { Authorization: auth }),
    );
    expect(res.status).toBe(400);
  });

  it("refuse d'ajouter des invités à l'événement d'un autre organisateur", async () => {
    const owner = await seedUser();
    const { id: eventId } = await seedEvent(owner.id);
    const intruder = await seedUser();
    const intruderAuth = await seedSession(intruder);

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/guests`,
      jsonInit("POST", { guests: [{ name: "Intrus" }] }, { Authorization: intruderAuth }),
    );
    expect(res.status).toBe(404);
  });
});
