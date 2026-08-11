import type { Context } from "hono";
import type { AppContext, Env } from "../types";

/**
 * Adresse IP du client, telle que vue par Cloudflare. `cf-connecting-ip` est
 * toujours posé par le réseau Cloudflare et ne peut pas être falsifié par le
 * client ; on ne retombe volontairement pas sur `x-forwarded-for`, qui est un
 * en-tête libre et permettait de repartir d'un compteur neuf à chaque requête.
 */
export function clientIp(c: Context<AppContext>): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

/**
 * Limitation de débit par (bucket, clé), adossée à un Durable Object dont le
 * stockage est transactionnel — voir `do/rate-limit-do.ts` pour le détail et
 * pour la raison du passage depuis KV.
 *
 * En cas d'indisponibilité du DO, on laisse passer : ces limites protègent des
 * abus, elles ne sont pas un contrôle d'accès, et une panne du compteur ne doit
 * pas fermer la billetterie.
 */
export async function isRateLimited(
  env: Env,
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(`${bucket}:${key}`));
    const res = await stub.fetch("https://do/check", {
      method: "POST",
      body: JSON.stringify({ limit, windowSeconds }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { limited: boolean };
    return data.limited === true;
  } catch (err) {
    console.error(`[rate-limit] compteur indisponible pour ${bucket}:`, err);
    return false;
  }
}

export function tooManyRequests(c: Context) {
  return c.json({ error: "Trop de requêtes, veuillez réessayer dans quelques minutes." }, 429);
}
