import type { Env } from "../types";

/**
 * Vérifie un jeton Turnstile côté serveur.
 *
 * Hors production, l'absence de TURNSTILE_SECRET_KEY laisse passer : on ne veut
 * pas imposer un widget configuré pour développer en local. En production, une
 * clé manquante fait échouer la vérification plutôt que de la désactiver en
 * silence — sans ça, une rotation ratée ou un nouvel environnement supprimait la
 * protection anti-robot sans qu'aucun log ni aucun test ne le signale.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.ENVIRONMENT === "production") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY absente en production — vérification refusée");
      return false;
    }
    return true;
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json<{ success: boolean }>().catch(() => ({ success: false }));
  return data.success === true;
}
