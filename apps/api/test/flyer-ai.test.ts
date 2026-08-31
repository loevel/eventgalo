import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { jsonInit, seedEvent, seedSession, seedUser } from "./helpers";

/**
 * Le binding Workers AI est absent en test (voir wrangler.test.jsonc) : on
 * couvre donc tout ce qui encadre l'appel au modèle — authentification,
 * propriété de l'événement, valeurs par défaut — sans jamais l'atteindre.
 */
describe("POST /api/events/:id/flyer/background", () => {
  it("exige une authentification", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/events/quelconque/flyer/background",
      jsonInit("POST", { format: "affiche" }),
    );
    expect(res.status).toBe(401);
  });

  it("refuse l'événement d'un autre organisateur", async () => {
    const owner = await seedUser();
    const event = await seedEvent(owner.id);
    const intrus = await seedUser();
    const auth = await seedSession(intrus);
    const res = await SELF.fetch(
      `https://api.test/api/events/${event.id}/flyer/background`,
      jsonInit("POST", { format: "affiche" }, { Authorization: auth }),
    );
    expect(res.status).toBe(404);
  });

  it("atteint le générateur pour l'organisateur de l'événement", async () => {
    const user = await seedUser();
    const event = await seedEvent(user.id, { title: "Gala des Bâtisseurs" });
    const auth = await seedSession(user);
    // Sans le binding AI, la génération échoue en 502 : ce qui compte ici est
    // que la requête ait bien franchi l'autorisation et atteint le générateur.
    const res = await SELF.fetch(
      `https://api.test/api/events/${event.id}/flyer/background`,
      jsonInit("POST", { format: "story", mood: "festif", hint: "salle de bal" }, { Authorization: auth }),
    );
    expect(res.status).toBe(502);
    expect((await res.json<{ error: string }>()).error).toMatch(/Génération indisponible/i);
  });

  it("tolère un format et une ambiance inconnus plutôt que de refuser", async () => {
    const user = await seedUser();
    const event = await seedEvent(user.id);
    const auth = await seedSession(user);
    const res = await SELF.fetch(
      `https://api.test/api/events/${event.id}/flyer/background`,
      jsonInit("POST", { format: "panneau-4x3", mood: "psychedelique" }, { Authorization: auth }),
    );
    // Repli sur « affiche » / « gala » : la requête va au bout au lieu d'échouer
    // en validation, et c'est le binding AI absent qui provoque le 502.
    expect(res.status).toBe(502);
  });
});
