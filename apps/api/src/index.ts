import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext, Env } from "./types";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import publicRoutes from "./routes/public";
import webhookRoutes from "./routes/stripe-webhook";
import connectRoutes from "./routes/connect";
import adminRoutes from "./routes/admin";
import { companyRoutes, companyDirectoryRoutes } from "./routes/companies";
import { nowIso } from "./lib/crypto";
import { eventLogoUrl, layout, sendEmail } from "./lib/email";

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
app.route("/api/public/companies", companyDirectoryRoutes);
app.route("/api/company", companyRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/connect", connectRoutes);
app.route("/api/admin", adminRoutes);

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

interface UpcomingEvent {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
}

/**
 * Rappel automatique ~24h avant l'événement, envoyé une seule fois par invité/billet
 * (marqué via reminder_sent_at). Le cron tourne toutes les heures ; la fenêtre de
 * 2h absorbe les décalages d'exécution sans doublons.
 */
async function sendEventReminders(env: Env): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(now + 23 * 3600 * 1000).toISOString();
  const windowEnd = new Date(now + 25 * 3600 * 1000).toISOString();

  const events = await env.DB.prepare(
    `SELECT id, title, starts_at, venue FROM events WHERE status = 'published' AND starts_at BETWEEN ? AND ?`,
  )
    .bind(windowStart, windowEnd)
    .all<UpcomingEvent>();

  for (const event of events.results) {
    const where = event.venue ? ` à ${event.venue}` : "";
    const logoUrl = await eventLogoUrl(env, event.id);
    const brand = { logoUrl, eventTitle: event.title };

    const guests = await env.DB.prepare(
      `SELECT id, name, email, token FROM guests
       WHERE event_id = ? AND email IS NOT NULL AND reminder_sent_at IS NULL AND rsvp_status != 'no'`,
    )
      .bind(event.id)
      .all<{ id: string; name: string; email: string; token: string }>();
    for (const g of guests.results) {
      const url = `${env.WEB_BASE_URL}/i/${g.token}`;
      await sendEmail(
        env,
        g.email,
        `Rappel : ${event.title}, c'est bientôt !`,
        layout(
          `À très bientôt — ${event.title}`,
          `<p>Petit rappel : l'événement <strong>${event.title}</strong> a lieu demain${where}.</p>
           <p><a href="${url}">Voir mon invitation</a></p>`,
          brand,
        ),
        url,
      );
      await env.DB.prepare("UPDATE guests SET reminder_sent_at = ? WHERE id = ?").bind(nowIso(), g.id).run();
    }

    const tickets = await env.DB.prepare(
      `SELECT id, buyer_email, serial FROM tickets
       WHERE event_id = ? AND status IN ('valid','used') AND reminder_sent_at IS NULL`,
    )
      .bind(event.id)
      .all<{ id: string; buyer_email: string; serial: string }>();
    for (const t of tickets.results) {
      const url = `${env.WEB_BASE_URL}/t/${t.serial}`;
      await sendEmail(
        env,
        t.buyer_email,
        `Rappel : ${event.title}, c'est bientôt !`,
        layout(
          `À très bientôt — ${event.title}`,
          `<p>Petit rappel : l'événement <strong>${event.title}</strong> a lieu demain${where}.</p>
           <p><a href="${url}">Voir mon billet</a></p>`,
          brand,
        ),
        url,
      );
      await env.DB.prepare("UPDATE tickets SET reminder_sent_at = ? WHERE id = ?").bind(nowIso(), t.id).run();
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    if (event.cron === "0 * * * *") {
      ctx.waitUntil(sendEventReminders(env));
    } else {
      ctx.waitUntil(purgeExpiredEvents(env));
    }
  },
};
