import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

/**
 * Le 31 août 2026, la connexion échouait avec un « Failed to fetch » depuis
 * www.eventgalo.com : les deux domaines servent le site, mais seul l'apex était
 * autorisé côté API. Le navigateur bloquait la requête avant l'API, donc l'échec
 * n'apparaissait dans aucun journal. Ces tests fixent le contrat des origines.
 */
function preflight(origin: string): Promise<Response> {
  return SELF.fetch("https://api.test/api/auth/magic-link", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
}

const allowOrigin = async (origin: string) =>
  (await preflight(origin)).headers.get("access-control-allow-origin");

describe("Origines autorisées à appeler l'API", () => {
  it("autorise le domaine officiel", async () => {
    expect(await allowOrigin("https://eventgalo.com")).toBe("https://eventgalo.com");
  });

  it("autorise la variante www du même domaine", async () => {
    expect(await allowOrigin("https://www.eventgalo.com")).toBe("https://www.eventgalo.com");
  });

  it("refuse un domaine tiers", async () => {
    expect(await allowOrigin("https://eventgalo.com.faux.example")).toBeFalsy();
    expect(await allowOrigin("https://evil.example")).toBeFalsy();
  });

  it("ne se laisse pas berner par un sous-domaine qui commence pareil", async () => {
    expect(await allowOrigin("https://wwweventgalo.com")).toBeFalsy();
    expect(await allowOrigin("https://www.eventgalo.com.evil.example")).toBeFalsy();
  });

  it("refuse le même domaine en clair", async () => {
    expect(await allowOrigin("http://eventgalo.com")).toBeFalsy();
    expect(await allowOrigin("http://www.eventgalo.com")).toBeFalsy();
  });
});
