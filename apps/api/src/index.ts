import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext, Env } from "./types";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import publicRoutes from "./routes/public";
import webhookRoutes from "./routes/stripe-webhook";
import { nowIso } from "./lib/crypto";

export { EventDO } from "./do/event-do";

const app = new Hono<AppContext>();

app.use("/api/*", cors({
  origin: (origin) => origin, // le token Bearer protège les routes ; l'API publique est… publique
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));

app.get("/", (c) => c.json({ name: "eventgalo-api", status: "ok", time: nowIso() }));
app.route("/api/auth", authRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/webhooks", webhookRoutes);

app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ error: "Erreur interne du serveur" }, 500);
});

/**
 * Purge quotidienne (conformité Loi 25 / RGPD) : 30 jours après la fin de
 * l'événement, anonymisation des données personnelles et archivage.
 */
async function purgeExpiredEvents(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const expired = await env.DB.prepare(
    `SELECT id FROM events WHERE status != 'archived' AND COALESCE(ends_at, starts_at) < ?`,
  )
    .bind(cutoff)
    .all<{ id: string }>();
  for (const { id } of expired.results) {
    // Suppression des photos (objets R2 + lignes media) avant l'anonymisation
    const media = await env.DB.prepare("SELECT r2_key FROM media WHERE event_id = ?")
      .bind(id)
      .all<{ r2_key: string }>();
    if (media.results.length) {
      await env.MEDIA.delete(media.results.map((m) => m.r2_key));
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM media WHERE event_id = ?").bind(id),
      env.DB.prepare(
        `UPDATE guests SET name = 'Invité anonymisé', email = NULL, phone = NULL,
           token = 'purged-' || id WHERE event_id = ?`,
      ).bind(id),
      env.DB.prepare(
        `UPDATE tickets SET buyer_name = 'Acheteur anonymisé', buyer_email = 'purged@eventgalo.local'
         WHERE event_id = ?`,
      ).bind(id),
      env.DB.prepare(
        `UPDATE transactions SET buyer_name = 'Acheteur anonymisé', buyer_email = 'purged@eventgalo.local'
         WHERE event_id = ?`,
      ).bind(id),
      env.DB.prepare("UPDATE events SET status = 'archived', updated_at = ? WHERE id = ?").bind(nowIso(), id),
    ]);
    console.log(`[purge] événement ${id} anonymisé et archivé`);
  }
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(purgeExpiredEvents(env));
  },
};
