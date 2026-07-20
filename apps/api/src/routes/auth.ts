import { Hono } from "hono";
import type { AppContext, AuthedUser } from "../types";
import { nowIso, randomToken, uuid } from "../lib/crypto";
import { layout, sendEmail } from "../lib/email";
import { ADMIN_SESSION_TTL, createSession, requireAuth, sessionKey } from "../lib/auth";
import { clientIp, isRateLimited, tooManyRequests } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";

const auth = new Hono<AppContext>();

/** Demande de magic link. */
auth.post("/magic-link", async (c) => {
  const body = await c.req
    .json<{ email?: string; name?: string; turnstile_token?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "Adresse email invalide" }, 400);
  }
  const ip = clientIp(c);
  if (!(await verifyTurnstile(c.env, body.turnstile_token, ip))) {
    return c.json({ error: "Vérification anti-robot échouée, réessayez." }, 400);
  }
  // 5 demandes / 5 min par IP : évite le bombardement de boîtes de réception.
  if (await isRateLimited(c.env, "magic-link", ip, 5, 300)) return tooManyRequests(c);
  const token = randomToken(24);
  await c.env.KV.put(
    `magic:${token}`,
    JSON.stringify({ email, name: body.name ?? null }),
    { expirationTtl: 900 },
  );
  const url = `${c.env.WEB_BASE_URL}/auth/callback?token=${token}`;
  const result = await sendEmail(
    c.env,
    email,
    "Votre lien de connexion EventGalo",
    layout(
      "Connexion à EventGalo",
      `<p>Cliquez sur ce lien pour vous connecter (valide 15 minutes) :</p>
       <p><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Se connecter</a></p>`,
    ),
    url,
  );
  return c.json({
    ok: true,
    message: result.sent
      ? "Lien de connexion envoyé par email."
      : "Email non configuré : utilisez le lien ci-dessous (mode dev).",
    ...(result.sent ? {} : { debug_url: result.debug_url }),
  });
});

/** Échange du magic token contre une session. */
auth.post("/verify", async (c) => {
  const { token } = await c.req.json<{ token?: string }>().catch(() => ({}) as Record<string, never>);
  if (!token) return c.json({ error: "Token manquant" }, 400);
  const raw = await c.env.KV.get(`magic:${token}`);
  if (!raw) return c.json({ error: "Lien expiré ou déjà utilisé" }, 401);
  await c.env.KV.delete(`magic:${token}`);
  const { email, name } = JSON.parse(raw) as { email: string; name: string | null };

  const existing = await c.env.DB.prepare("SELECT id, email, name, role, status FROM users WHERE email = ?")
    .bind(email)
    .first<AuthedUser & { role: string; status: string }>();
  if (existing?.status === "suspended") {
    return c.json({ error: "Ce compte a été suspendu. Contactez le support." }, 403);
  }
  let user: AuthedUser;
  let role = "user";
  if (!existing) {
    const id = uuid();
    await c.env.DB.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, email, name, nowIso())
      .run();
    user = { id, email, name };
  } else {
    user = { id: existing.id, email: existing.email, name: existing.name };
    role = existing.role;
  }

  const isAdmin = role === "admin" || role === "superadmin";
  const session = randomToken(32);
  await createSession(c.env.KV, user, session, isAdmin ? ADMIN_SESSION_TTL : undefined);

  if (isAdmin) {
    const ip = clientIp(c);
    await sendEmail(
      c.env,
      email,
      "Nouvelle connexion administrateur — EventGalo",
      layout(
        "Nouvelle connexion à l'espace admin",
        `<p>Une connexion vient d'être effectuée sur votre compte administrateur EventGalo.</p>
         <p>Date : ${nowIso()}<br/>Adresse IP : ${ip}</p>
         <p>Si ce n'était pas vous, contactez immédiatement le support.</p>`,
      ),
    );
  }

  return c.json({ token: session, user });
});

/** Rôle toujours lu en base (jamais depuis la session KV, qui peut être ancienne). */
auth.get("/me", requireAuth, async (c) => {
  const session = c.get("user");
  const fresh = await c.env.DB.prepare("SELECT role, status FROM users WHERE id = ?")
    .bind(session.id)
    .first<{ role: string; status: string }>();
  return c.json({ user: { ...session, role: fresh?.role ?? "user", status: fresh?.status ?? "active" } });
});

/** Déconnexion : révoque la session KV. */
auth.delete("/session", requireAuth, async (c) => {
  const token = (c.req.header("Authorization") ?? "").slice(7);
  await c.env.KV.delete(sessionKey(token));
  return c.json({ ok: true });
});

export default auth;
