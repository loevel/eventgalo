import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { esc, escapeUrl, layout } from "../src/lib/email";
import { validateWebhookUrl } from "../src/lib/webhooks";
import { revokeUserSessions } from "../src/lib/auth";
import { seedSession, seedUser } from "./helpers";

describe("Échappement des gabarits d'email", () => {
  it("neutralise le HTML injecté dans le titre", () => {
    const html = layout('Gala <img src=x onerror="alert(1)">', "<p>corps</p>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("neutralise le HTML injecté dans le nom de l'événement en en-tête", () => {
    const html = layout("Titre", "<p>corps</p>", { eventTitle: '"><script>alert(1)</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("échappe un lien de phishing glissé dans un champ libre", () => {
    const injected = 'Traiteur <a href="https://faux-stripe.example">Payer maintenant</a>';
    expect(esc(injected)).not.toContain("<a href");
    expect(esc(injected)).toContain("&lt;a href");
  });

  it("remplace une valeur absente par le texte de repli", () => {
    expect(esc(null, "—")).toBe("—");
    expect(esc(undefined)).toBe("");
  });

  it("refuse les schémas d'URL non cliquables dans un email", () => {
    expect(escapeUrl("javascript:alert(1)")).toBeNull();
    expect(escapeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(escapeUrl("pas une url")).toBeNull();
    expect(escapeUrl("https://exemple.test/logo.png")).toBe("https://exemple.test/logo.png");
  });
});

describe("Validation des URL de webhook", () => {
  it("accepte une URL publique en HTTPS", () => {
    expect(validateWebhookUrl("https://hooks.exemple.test/eventgalo")).toBeNull();
  });

  it("refuse le HTTP en clair", () => {
    expect(validateWebhookUrl("http://hooks.exemple.test/x")).toMatch(/https/);
  });

  it("refuse la boucle locale et les réseaux privés", () => {
    for (const url of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.20/x",
      "https://172.16.4.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
    ]) {
      expect(validateWebhookUrl(url), url).not.toBeNull();
    }
  });

  it("refuse un port non standard", () => {
    expect(validateWebhookUrl("https://hooks.exemple.test:8443/x")).toMatch(/port/);
  });
});

describe("Révocation de session", () => {
  it("invalide immédiatement une session existante", async () => {
    const user = await seedUser();
    const authorization = await seedSession(user);

    const before = await SELF.fetch("https://api.test/api/events", { headers: { authorization } });
    expect(before.status).toBe(200);

    await revokeUserSessions(env.KV, user.id);

    const after = await SELF.fetch("https://api.test/api/events", { headers: { authorization } });
    expect(after.status).toBe(401);
  });

  it("refuse l'accès à un compte suspendu, même avec une session valide", async () => {
    const user = await seedUser();
    const authorization = await seedSession(user);
    await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").bind(user.id).run();

    const res = await SELF.fetch("https://api.test/api/events", { headers: { authorization } });
    expect(res.status).toBe(403);
  });
});
