import type { Context } from "hono";
import type { z } from "zod";

/**
 * Valide le corps JSON d'une requête contre un schéma zod, en conservant le
 * format d'erreur déjà utilisé partout ailleurs dans l'API : `{ error: "<message
 * en français>" }` avec un statut 400. N'utilise que le premier problème
 * rencontré — un seul message clair plutôt qu'une liste de problèmes techniques.
 */
export async function parseBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  const raw = await c.req.json().catch(() => ({}));
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "Requête invalide";
    return { ok: false, response: c.json({ error: message }, 400) };
  }
  return { ok: true, data: result.data };
}
