import type { Context } from "hono";
import type { AppContext, Env } from "../types";

/** Adresse IP du client, telle que vue par Cloudflare. */
export function clientIp(c: Context<AppContext>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
}

/**
 * Limitation de débit approximative basée sur KV : un compteur par (bucket, clé),
 * expirant après `windowSeconds`. Imprécis sous forte concurrence (pas d'incrément
 * atomique), mais suffisant pour dissuader le spam/abus sur les endpoints publics
 * sans dépendre d'un binding Workers Rate Limiting (plan payant).
 */
export async function isRateLimited(
  env: Env,
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const k = `ratelimit:${bucket}:${key}`;
  const raw = await env.KV.get(k);
  const count = raw ? Number(raw) : 0;
  if (count >= limit) return true;
  await env.KV.put(k, String(count + 1), { expirationTtl: windowSeconds });
  return false;
}

export function tooManyRequests(c: Context) {
  return c.json({ error: "Trop de requêtes, veuillez réessayer dans quelques minutes." }, 429);
}
