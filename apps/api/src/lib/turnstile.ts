import type { Env } from "../types";

/**
 * Vérifie un jeton Turnstile côté serveur. Si TURNSTILE_SECRET_KEY n'est pas
 * configuré (dev local), la vérification est ignorée pour ne pas bloquer le
 * développement sans widget configuré.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
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
