import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedCategory, seedEvent, seedSession, seedUser } from "./helpers";

function ipHeader(ip: string) {
  return { "cf-connecting-ip": ip };
}

describe("POST /api/public/waitlist", () => {
  it("refuse de s'inscrire si la catégorie n'est pas épuisée", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { id: categoryId } = await seedCategory(eventId, { quantity: 10, sold: 2 });

    const res = await SELF.fetch(
      "https://api.test/api/public/waitlist",
      jsonInit(
        "POST",
        { category_id: categoryId, name: "Alex", email: "alex@example.com" },
        ipHeader("203.0.113.20"),
      ),
    );
    expect(res.status).toBe(409);
  });

  it("inscrit sur liste d'attente une catégorie épuisée", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { id: categoryId } = await seedCategory(eventId, { quantity: 5, sold: 5 });

    const res = await SELF.fetch(
      "https://api.test/api/public/waitlist",
      jsonInit(
        "POST",
        { category_id: categoryId, name: "Alex", email: "alex@example.com" },
        ipHeader("203.0.113.21"),
      ),
    );
    expect(res.status).toBe(201);

    const row = await env.DB.prepare("SELECT name, email, notified_at FROM waitlist WHERE category_id = ?")
      .bind(categoryId)
      .first<{ name: string; email: string; notified_at: string | null }>();
    expect(row?.name).toBe("Alex");
    expect(row?.notified_at).toBeNull();
  });

  it("rejette un email invalide", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const { id: categoryId } = await seedCategory(eventId, { quantity: 1, sold: 1 });

    const res = await SELF.fetch(
      "https://api.test/api/public/waitlist",
      jsonInit("POST", { category_id: categoryId, name: "Alex", email: "pas-un-email" }, ipHeader("203.0.113.22")),
    );
    expect(res.status).toBe(400);
  });
});

describe("Notification de la liste d'attente", () => {
  it("notifie les inscrits quand la quantité d'une catégorie augmente", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id, { capacity: 20 });
    const { id: categoryId } = await seedCategory(eventId, { quantity: 5, sold: 5 });

    await SELF.fetch(
      "https://api.test/api/public/waitlist",
      jsonInit(
        "POST",
        { category_id: categoryId, name: "Alex", email: "alex@example.com" },
        ipHeader("203.0.113.23"),
      ),
    );

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/categories/${categoryId}`,
      jsonInit("PATCH", { quantity: 6 }, { Authorization: auth }),
    );
    expect(res.status).toBe(200);

    // La notification part via c.executionCtx.waitUntil() : elle peut s'exécuter juste
    // après la réponse HTTP, d'où ce court sondage plutôt qu'une lecture immédiate.
    let notifiedAt: string | null = null;
    for (let i = 0; i < 20 && !notifiedAt; i++) {
      const row = await env.DB.prepare("SELECT notified_at FROM waitlist WHERE category_id = ?")
        .bind(categoryId)
        .first<{ notified_at: string | null }>();
      notifiedAt = row?.notified_at ?? null;
      if (!notifiedAt) await new Promise((r) => setTimeout(r, 10));
    }
    expect(notifiedAt).not.toBeNull();
  });
});
