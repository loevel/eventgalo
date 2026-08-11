import type { Context, Next } from "hono";
import type { AppContext, AuthedUser } from "../types";

export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 jours — comptes standards
// Comptes admin/superadmin : session bien plus courte, pour limiter la fenêtre
// d'exposition si un jeton de session venait à fuiter.
export const ADMIN_SESSION_TTL = 60 * 60 * 12; // 12 heures

export function sessionKey(token: string): string {
  return `sess:${token}`;
}

function revocationKey(userId: string): string {
  return `revoked:${userId}`;
}

/** Session telle que stockée dans KV : l'utilisateur, plus la date d'émission. */
interface StoredSession {
  user: AuthedUser;
  issued_at: number;
}

export async function createSession(
  kv: KVNamespace,
  user: AuthedUser,
  token: string,
  ttl: number = SESSION_TTL,
): Promise<void> {
  const payload: StoredSession = { user, issued_at: Date.now() };
  await kv.put(sessionKey(token), JSON.stringify(payload), { expirationTtl: ttl });
}

/**
 * Révoque immédiatement toutes les sessions d'un utilisateur (suspension,
 * « déconnecter tous mes appareils »).
 *
 * On pose une borne temporelle plutôt que de parcourir une liste de jetons :
 * l'ancienne implémentation maintenait dans KV une liste plafonnée à 20 entrées,
 * mise à jour par un get/put sans verrou. Deux connexions simultanées perdaient
 * un jeton, et au-delà de 20 sessions les plus anciennes sortaient de la liste —
 * elles restaient alors valides jusqu'à 30 jours après une suspension. Une borne
 * ne peut ni se perdre ni déborder.
 */
export async function revokeUserSessions(kv: KVNamespace, userId: string): Promise<void> {
  await kv.put(revocationKey(userId), String(Date.now()), { expirationTtl: SESSION_TTL });
}

/**
 * Middleware : exige un header Authorization: Bearer <session>.
 *
 * Trois conditions, toutes vérifiées à chaque requête : la session existe, elle
 * est postérieure à la dernière révocation, et le compte n'est pas suspendu.
 * Ce dernier point était auparavant contrôlé uniquement par `requireAdmin` —
 * un compte standard suspendu gardait donc l'accès à ses propres routes.
 */
export async function requireAuth(c: Context<AppContext>, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Authentification requise" }, 401);

  const raw = await c.env.KV.get(sessionKey(token));
  if (!raw) return c.json({ error: "Session expirée" }, 401);

  const stored = JSON.parse(raw) as StoredSession | AuthedUser;
  // Tolère les sessions écrites par l'ancien format (l'utilisateur à la racine),
  // le temps qu'elles expirent naturellement.
  const isNewFormat = "user" in stored && "issued_at" in stored;
  const user = isNewFormat ? (stored as StoredSession).user : (stored as AuthedUser);
  const issuedAt = isNewFormat ? (stored as StoredSession).issued_at : 0;

  const revokedAt = await c.env.KV.get(revocationKey(user.id));
  if (revokedAt && issuedAt <= Number(revokedAt)) {
    await c.env.KV.delete(sessionKey(token));
    return c.json({ error: "Session révoquée. Reconnectez-vous." }, 401);
  }

  const account = await c.env.DB.prepare("SELECT status FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ status: string }>();
  if (!account) return c.json({ error: "Session expirée" }, 401);
  if (account.status === "suspended") {
    return c.json({ error: "Ce compte a été suspendu. Contactez le support." }, 403);
  }

  c.set("user", user);
  await next();
}
