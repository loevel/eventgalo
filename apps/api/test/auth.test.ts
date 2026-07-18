import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { jsonInit } from "./helpers";

// Une IP simulée différente par test : évite toute interférence entre tests
// via le compteur de limitation de débit (partagé en KV entre requêtes).
function ipHeader(ip: string) {
  return { "cf-connecting-ip": ip };
}

describe("POST /api/auth/magic-link", () => {
  it("rejette une adresse email invalide", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/auth/magic-link",
      jsonInit("POST", { email: "pas-un-email" }, ipHeader("203.0.113.1")),
    );
    expect(res.status).toBe(400);
  });

  it("émet un lien de connexion en mode debug (EMAIL_FROM désactivé en test)", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/auth/magic-link",
      jsonInit("POST", { email: "nouveau@example.com" }, ipHeader("203.0.113.2")),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ debug_url?: string }>();
    expect(body.debug_url).toContain("/auth/callback?token=");
  });

  it("limite le débit après plusieurs demandes rapprochées depuis la même IP", async () => {
    const ip = ipHeader("203.0.113.3");
    let lastStatus = 200;
    for (let i = 0; i < 6; i++) {
      const res = await SELF.fetch(
        "https://api.test/api/auth/magic-link",
        jsonInit("POST", { email: `spam${i}@example.com` }, ip),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("n'affecte pas une autre IP", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/auth/magic-link",
      jsonInit("POST", { email: "voisin@example.com" }, ipHeader("203.0.113.4")),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/verify", () => {
  async function requestMagicLink(email: string, ip: string): Promise<string> {
    const res = await SELF.fetch("https://api.test/api/auth/magic-link", jsonInit("POST", { email }, ipHeader(ip)));
    const body = await res.json<{ debug_url: string }>();
    return new URL(body.debug_url).searchParams.get("token")!;
  }

  it("crée une session pour un token valide, puis rejette sa réutilisation", async () => {
    const token = await requestMagicLink("verify@example.com", "203.0.113.10");

    const verifyRes = await SELF.fetch("https://api.test/api/auth/verify", jsonInit("POST", { token }));
    expect(verifyRes.status).toBe(200);
    const body = await verifyRes.json<{ token: string; user: { email: string } }>();
    expect(body.user.email).toBe("verify@example.com");
    expect(body.token).toBeTruthy();

    const reuseRes = await SELF.fetch("https://api.test/api/auth/verify", jsonInit("POST", { token }));
    expect(reuseRes.status).toBe(401);
  });

  it("rejette un token inconnu", async () => {
    const res = await SELF.fetch("https://api.test/api/auth/verify", jsonInit("POST", { token: "n-importe-quoi" }));
    expect(res.status).toBe(401);
  });
});
