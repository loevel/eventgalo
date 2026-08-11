import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

/**
 * Le cache de données de Next a besoin d'un magasin explicite sur Cloudflare.
 *
 * La configuration était vide, si bien que tout `fetch` marqué
 * `next: { revalidate: n }` échouait faute d'endroit où écrire — la page
 * événement rendait un 404 et la page de découverte son état d'erreur. Seules
 * les pages en `cache: "no-store"`, qui court-circuitent ce cache, marchaient,
 * ce qui rendait la panne invisible jusqu'à ce qu'on s'appuie dessus.
 *
 * Le binding `NEXT_INC_CACHE_KV` est déclaré dans `wrangler.jsonc`, avec un
 * namespace distinct par environnement.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
