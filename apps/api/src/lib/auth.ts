import type { Context, Next } from "hono";
import type { AppContext, AuthedUser } from "../types";

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 jours

export function sessionKey(token: string): string {
  return `sess:${token}`;
}

export async function createSession(kv: KVNamespace, user: AuthedUser, token: string): Promise<void> {
  await kv.put(sessionKey(token), JSON.stringify(user), { expirationTtl: SESSION_TTL });
}

/** Middleware : exige un header Authorization: Bearer <session>. */
export async function requireAuth(c: Context<AppContext>, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Authentification requise" }, 401);
  const raw = await c.env.KV.get(sessionKey(token));
  if (!raw) return c.json({ error: "Session expirée" }, 401);
  c.set("user", JSON.parse(raw) as AuthedUser);
  await next();
}
