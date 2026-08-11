import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { notifyWaitlist } from "../src/lib/waitlist";
import { jsonInit, seedCategory, seedEvent, seedUser } from "./helpers";

interface WaitlistReply {
  ok: boolean;
  kind: "waitlist" | "interest";
  rank: number | null;
  sold_out: boolean;
}

/**
 * La route est limitée à 10 requêtes/min par IP, et le compteur vit dans un
 * Durable Object partagé par tout le fichier. Chaque test s'annonce donc depuis
 * une IP qui lui est propre — ce qui reflète aussi la réalité : ces inscriptions
 * viennent de visiteurs différents.
 */
async function join(categoryId: string, name: string, email: string, ip = "203.0.113.1") {
  const res = await SELF.fetch(
    "https://api.test/api/public/waitlist",
    jsonInit("POST", { category_id: categoryId, name, email }, { "cf-connecting-ip": ip }),
  );
  return { status: res.status, body: await res.json<WaitlistReply>() };
}

/** Catégorie complète : 10 places, 10 vendues. */
async function seedSoldOutCategory() {
  const organizer = await seedUser();
  const { id: eventId } = await seedEvent(organizer.id, { type: "ticketed" });
  const { id } = await seedCategory(eventId, { quantity: 10, sold: 10 });
  return id;
}

describe("liste d'attente", () => {
  it("renvoie le rang, dans l'ordre d'arrivée", async () => {
    const categoryId = await seedSoldOutCategory();

    const first = await join(categoryId, "Première", "premiere@example.com", "203.0.113.1");
    const second = await join(categoryId, "Deuxième", "deuxieme@example.com", "203.0.113.1");
    const third = await join(categoryId, "Troisième", "troisieme@example.com", "203.0.113.1");

    expect(first.body.rank).toBe(1);
    expect(second.body.rank).toBe(2);
    expect(third.body.rank).toBe(3);
    expect(first.body.kind).toBe("waitlist");
    expect(first.body.sold_out).toBe(true);
  });

  it("est idempotente : se réinscrire ne crée pas de doublon et ne fait pas reculer", async () => {
    const categoryId = await seedSoldOutCategory();
    await join(categoryId, "Première", "premiere@example.com", "203.0.113.2");
    await join(categoryId, "Deuxième", "deuxieme@example.com", "203.0.113.2");

    const again = await join(categoryId, "Première", "premiere@example.com", "203.0.113.2");
    expect(again.body.rank).toBe(1);

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE category_id = ?")
      .bind(categoryId)
      .first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  it("fait avancer les suivants quand quelqu'un est prévenu", async () => {
    const categoryId = await seedSoldOutCategory();
    await join(categoryId, "Première", "premiere@example.com", "203.0.113.3");
    await join(categoryId, "Deuxième", "deuxieme@example.com", "203.0.113.3");

    await notifyWaitlist(env, categoryId, 1); // une place se libère

    const second = await join(categoryId, "Deuxième", "deuxieme@example.com", "203.0.113.3");
    expect(second.body.rank).toBe(1);
  });

  it("accepte une catégorie disponible comme manifestation d'intérêt, sans rang", async () => {
    const organizer = await seedUser();
    const { id: eventId } = await seedEvent(organizer.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId, { quantity: 10, sold: 2 });

    const res = await join(categoryId, "Curieuse", "curieuse@example.com", "203.0.113.4");

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("interest");
    expect(res.body.sold_out).toBe(false);
    expect(res.body.rank).toBeNull();
  });

  it("ne prévient pas les curieux quand une place se libère", async () => {
    const organizer = await seedUser();
    const { id: eventId } = await seedEvent(organizer.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId, { quantity: 10, sold: 2 });
    await join(categoryId, "Curieuse", "pas-relancee@example.com", "203.0.113.5");

    await notifyWaitlist(env, categoryId, 5);

    const row = await env.DB.prepare("SELECT notified_at FROM waitlist WHERE email = ?")
      .bind("pas-relancee@example.com")
      .first<{ notified_at: string | null }>();
    expect(row?.notified_at).toBeNull();
  });

  it("refuse une catégorie inconnue", async () => {
    const res = await join("categorie-inexistante", "Personne", "personne@example.com", "203.0.113.6");
    expect(res.status).toBe(404);
  });

  it("refuse un email invalide", async () => {
    const categoryId = await seedSoldOutCategory();
    const res = await SELF.fetch(
      "https://api.test/api/public/waitlist",
      jsonInit(
        "POST",
        { category_id: categoryId, name: "Sans email", email: "pas-un-email" },
        { "cf-connecting-ip": "203.0.113.7" },
      ),
    );
    expect(res.status).toBe(400);
  });
});
