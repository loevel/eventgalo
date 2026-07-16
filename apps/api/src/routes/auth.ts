import { Hono } from "hono";
import type { AppContext, AuthedUser } from "../types";
import { nowIso, randomToken, uuid } from "../lib/crypto";
import { layout, sendEmail } from "../lib/email";
import { createSession, requireAuth, sessionKey } from "../lib/auth";

const auth = new Hono<AppContext>();

/** Demande de magic link. */
auth.post("/magic-link", async (c) => {
  const body = await c.req.json<{ email?: string; name?: string }>().catch(() => ({}) as Record<string, never>);
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "Adresse email invalide" }, 400);
  }
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

  let user = await c.env.DB.prepare("SELECT id, email, name FROM users WHERE email = ?")
    .bind(email)
    .first<AuthedUser>();
  if (!user) {
    const id = uuid();
    await c.env.DB.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, email, name, nowIso())
      .run();
    user = { id, email, name };
  }

  const session = randomToken(32);
  await createSession(c.env.KV, user, session);
  return c.json({ token: session, user });
});

auth.get("/me", requireAuth, async (c) => c.json({ user: c.get("user") }));

/** Déconnexion : révoque la session KV. */
auth.delete("/session", requireAuth, async (c) => {
  const token = (c.req.header("Authorization") ?? "").slice(7);
  await c.env.KV.delete(sessionKey(token));
  return c.json({ ok: true });
});

export default auth;
