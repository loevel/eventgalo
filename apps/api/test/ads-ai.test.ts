import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedSession, seedUser } from "./helpers";

/**
 * Le binding Workers AI est absent en test (voir wrangler.test.jsonc) : on
 * couvre donc tout ce qui encadre l'appel — authentification, existence du
 * profil entreprise, validation du style — sans jamais atteindre le modèle.
 */
describe("POST /api/company/ads/ai/background", () => {
  it("exige une authentification", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/company/ads/ai/background",
      jsonInit("POST", { style: "photo" }),
    );
    expect(res.status).toBe(401);
  });

  it("exige un profil entreprise avant de générer", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const res = await SELF.fetch(
      "https://api.test/api/company/ads/ai/background",
      jsonInit("POST", { style: "photo" }, { Authorization: auth }),
    );
    expect(res.status).toBe(409);
    expect((await res.json<{ error: string }>()).error).toMatch(/profil entreprise/i);
  });

  it("ne confond pas cette route avec un identifiant de créneau", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    await env.DB.prepare("INSERT INTO companies (id, owner_user_id, name, sector) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.id, "Traiteur Test", "Traiteur")
      .run();
    // Sans le binding AI, la génération échoue en 502 : ce qui compte ici est
    // que la requête ait bien atteint le générateur et non la route /:id/image.
    const res = await SELF.fetch(
      "https://api.test/api/company/ads/ai/background",
      jsonInit("POST", { style: "festif", hint: "buffet africain" }, { Authorization: auth }),
    );
    expect(res.status).toBe(502);
    expect((await res.json<{ error: string }>()).error).toMatch(/Génération indisponible/i);
  });
});
