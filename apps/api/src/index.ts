import { Hono } from "hono";
import { cors } from "hono/cors";
import * as Sentry from "@sentry/cloudflare";
import type { AppContext, Env } from "./types";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import publicRoutes from "./routes/public";
import webhookRoutes from "./routes/stripe-webhook";
import connectRoutes from "./routes/connect";
import adminRoutes from "./routes/admin";
import { companyRoutes, companyDirectoryRoutes } from "./routes/companies";
import { adRoutes, publicAdRoutes } from "./routes/ads";
import { analyticsRoutes } from "./routes/analytics";
import { notificationRoutes } from "./routes/notifications";
import { nowIso } from "./lib/crypto";
import { esc, eventLogoUrl, layout, sendEmail } from "./lib/email";
import { THUMB_SUFFIX } from "./lib/media";
import { callEventDO } from "./do/event-do";

export { EventDO } from "./do/event-do";
export { RateLimitDO } from "./do/rate-limit-do";

const app = new Hono<AppContext>();

/**
 * Origines autorisées à appeler l'API depuis un navigateur. L'authentification
 * étant par jeton Bearer, un CORS permissif n'ouvrait pas de faille CSRF — mais
 * réfléchir n'importe quelle origine offrait à un site tiers un accès direct à
 * l'API avec un jeton volé, et empêchait de repérer un usage anormal. Le front
 * officiel est le seul consommateur navigateur : on s'y limite.
 */
function allowedOrigin(origin: string, env: Env): string | null {
  if (!origin) return null;
  if (origin === env.WEB_BASE_URL) return origin;
  // Développement local : ports Next.js/Wrangler usuels.
  if (env.ENVIRONMENT !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return null;
}

app.use("/api/*", (c, next) =>
  cors({
    origin: (origin) => allowedOrigin(origin, c.env) ?? "",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })(c, next),
);

app.get("/", (c) => c.json({ name: "eventgalo-api", status: "ok", time: nowIso() }));
app.route("/api/auth", authRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/public/companies", companyDirectoryRoutes);
app.route("/api/company", companyRoutes);
app.route("/api/company/ads", adRoutes);
app.route("/api/public/ads", publicAdRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/connect", connectRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/notifications", notificationRoutes);

app.onError((err, c) => {
  console.error("unhandled", err);
  Sentry.captureException(err);
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
      // Les vignettes comptent : elles vivent sous `<clé>.thumb` et n'ont pas de
      // ligne `media` propre. Les oublier laissait un objet R2 orphelin par photo,
      // facturé indéfiniment et devenu introuvable une fois la ligne supprimée.
      await env.MEDIA.delete(media.results.flatMap((m) => [m.r2_key, `${m.r2_key}${THUMB_SUFFIX}`]));
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
 * Une invocation de Worker est plafonnée à 1000 sous-requêtes. Chaque
 * destinataire en consomme deux (envoi + marquage), plus quelques-unes par
 * événement : on plafonne largement en dessous et on laisse l'exécution suivante
 * reprendre le reliquat. Sans ce plafond, un seul gala de 400 invités faisait
 * dépasser la limite et les destinataires suivants ne recevaient jamais rien.
 */
const MAX_REMINDERS_PER_RUN = 300;
/** Taille des lots d'envoi : au-delà, on sature les connexions sortantes du worker. */
const REMINDER_BATCH_SIZE = 20;

/** Envoie un lot de rappels en parallèle, puis marque les destinataires servis. */
async function sendReminderBatch<T>(
  env: Env,
  rows: T[],
  send: (row: T) => Promise<void>,
  mark: (row: T) => D1PreparedStatement,
): Promise<void> {
  for (let i = 0; i < rows.length; i += REMINDER_BATCH_SIZE) {
    const slice = rows.slice(i, i + REMINDER_BATCH_SIZE);
    // `allSettled` : un email refusé par le destinataire ne doit pas interrompre
    // la tournée pour tous les suivants.
    await Promise.allSettled(slice.map(send));
    await env.DB.batch(slice.map(mark));
  }
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

  let budget = MAX_REMINDERS_PER_RUN;
  for (const event of events.results) {
    if (budget <= 0) {
      console.log("[rappels] plafond atteint, reliquat reporté à la prochaine exécution");
      return;
    }
    const where = event.venue ? ` à ${event.venue}` : "";
    const logoUrl = await eventLogoUrl(env, event.id);
    const brand = { logoUrl, eventTitle: event.title };
    const subject = `Rappel : ${event.title}, c'est bientôt !`;
    const heading = `À très bientôt — ${event.title}`;
    const reminderBody = (link: string, label: string) =>
      `<p>Petit rappel : l'événement <strong>${esc(event.title)}</strong> a lieu demain${esc(where)}.</p>
       <p><a href="${link}">${label}</a></p>`;

    const guests = await env.DB.prepare(
      `SELECT id, name, email, token FROM guests
       WHERE event_id = ? AND email IS NOT NULL AND reminder_sent_at IS NULL AND rsvp_status != 'no'
       ORDER BY created_at LIMIT ?`,
    )
      .bind(event.id, budget)
      .all<{ id: string; name: string; email: string; token: string }>();
    budget -= guests.results.length;

    await sendReminderBatch(
      env,
      guests.results,
      async (g) => {
        const url = `${env.WEB_BASE_URL}/i/${g.token}`;
        await sendEmail(env, g.email, subject, layout(heading, reminderBody(url, "Voir mon invitation"), brand), url);
      },
      (g) => env.DB.prepare("UPDATE guests SET reminder_sent_at = ? WHERE id = ?").bind(nowIso(), g.id),
    );

    if (budget <= 0) continue;
    const tickets = await env.DB.prepare(
      `SELECT id, buyer_email, serial FROM tickets
       WHERE event_id = ? AND status IN ('valid','used') AND reminder_sent_at IS NULL
       ORDER BY created_at LIMIT ?`,
    )
      .bind(event.id, budget)
      .all<{ id: string; buyer_email: string; serial: string }>();
    budget -= tickets.results.length;

    await sendReminderBatch(
      env,
      tickets.results,
      async (t) => {
        const url = `${env.WEB_BASE_URL}/t/${t.serial}`;
        await sendEmail(env, t.buyer_email, subject, layout(heading, reminderBody(url, "Voir mon billet"), brand), url);
      },
      (t) => env.DB.prepare("UPDATE tickets SET reminder_sent_at = ? WHERE id = ?").bind(nowIso(), t.id),
    );
  }
}

/** Au-delà de ce délai, une réservation non payée est considérée abandonnée. */
const PENDING_TRANSACTION_TTL_MINUTES = 45;

/**
 * Libère les places retenues par des réservations jamais payées.
 *
 * `reserve()` incrémente `sold` avant le paiement, et la seule voie de retour
 * était le webhook Stripe `checkout.session.expired`. Une livraison manquée —
 * incident Stripe, déploiement pendant la fenêtre, erreur passagère — verrouillait
 * les places définitivement : sur un événement affichant complet, cela plafonnait
 * le revenu sans que rien ne le signale. Ce balayage est le filet de sécurité qui
 * manquait ; il libère aussi les quotas vendeurs pris de la même façon.
 */
async function releaseStalePendingTransactions(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_TRANSACTION_TTL_MINUTES * 60_000).toISOString();
  const stale = await env.DB.prepare(
    `SELECT id, event_id FROM transactions WHERE status = 'pending' AND created_at < ? LIMIT 200`,
  )
    .bind(cutoff)
    .all<{ id: string; event_id: string }>();

  for (const tx of stale.results) {
    try {
      await callEventDO(env, tx.event_id, { action: "cancel", transaction_id: tx.id });
    } catch (err) {
      // Une transaction récalcitrante ne doit pas bloquer la libération des autres.
      console.error(`[balayage] échec de l'annulation de ${tx.id}:`, err);
    }
  }
  if (stale.results.length) {
    console.log(`[balayage] ${stale.results.length} réservation(s) abandonnée(s) libérée(s)`);
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT,
    tracesSampleRate: 0.1,
  }),
  {
    fetch: app.fetch,
    scheduled: async (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
      // Le cron horaire porte les tâches de fonctionnement (rappels, libération
      // du stock réservé) ; le cron quotidien porte la purge de conformité.
      const task =
        event.cron === "0 * * * *"
          ? Promise.allSettled([sendEventReminders(env), releaseStalePendingTransactions(env)]).then((results) => {
              const failed = results.find((r) => r.status === "rejected");
              if (failed && failed.status === "rejected") throw failed.reason;
            })
          : purgeExpiredEvents(env);
      ctx.waitUntil(
        task.catch((err) => {
          Sentry.captureException(err);
          throw err;
        }),
      );
    },
  } satisfies ExportedHandler<Env>,
);
