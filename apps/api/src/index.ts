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
import meRoutes from "./routes/me";
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
/** `https://eventgalo.com` → `https://www.eventgalo.com`, ou null si déjà en www. */
function withWww(base: string): string | null {
  try {
    const url = new URL(base);
    if (url.hostname.startsWith("www.")) return null;
    url.hostname = `www.${url.hostname}`;
    return url.origin;
  } catch {
    return null;
  }
}

function allowedOrigin(origin: string, env: Env): string | null {
  if (!origin) return null;
  if (origin === env.WEB_BASE_URL) return origin;
  // Le site répond aussi bien avec que sans `www` — les deux domaines sont
  // attachés au worker web côté Cloudflare. N'autoriser que l'apex faisait
  // échouer la connexion depuis www.eventgalo.com par un « Failed to fetch »
  // opaque : le navigateur bloque avant même que l'API voie la requête, donc
  // rien n'apparaissait non plus dans les journaux.
  if (origin === withWww(env.WEB_BASE_URL)) return origin;
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
app.route("/api/me", meRoutes);

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

/**
 * Fenêtre de rattrapage du récapitulatif d'après-événement.
 *
 * On n'envoie pas « à J+1 » au sens strict : l'email n'a de sens que si des
 * photos sont effectivement publiées, et un organisateur met souvent deux ou
 * trois jours à trier sa soirée. On attend donc au moins `MIN` après la fin
 * (le temps que tout le monde soit rentré), puis on guette la mise en ligne
 * pendant `MAX`. Passé ce délai, l'email arriverait trop tard pour intéresser
 * qui que ce soit et l'événement est classé sans suite.
 */
const RECAP_MIN_HOURS_AFTER_END = 20;
const RECAP_MAX_DAYS_AFTER_END = 7;
/** Même raison que `MAX_REMINDERS_PER_RUN` : plafond de sous-requêtes par invocation. */
const MAX_RECAPS_PER_RUN = 250;

interface RecapEvent {
  id: string;
  title: string;
  public_slug: string;
  organizer_id: string;
  ended_at: string;
}

/** Date lisible dans un email. Le worker tourne en UTC : on affiche l'heure de l'Est, le marché visé. */
function formatEventDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Toronto",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Envoie le récapitulatif « les photos sont en ligne » aux personnes qui étaient
 * présentes, avec en pied de message le prochain événement du même organisateur.
 *
 * Conditions d'éligibilité, dans l'ordre où elles filtrent :
 *  - l'événement est terminé depuis assez longtemps, mais pas trop ;
 *  - au moins une photo est publiée sur la fiche (`media.featured = 1`) — sans
 *    quoi l'email promettrait une galerie vide ;
 *  - le récapitulatif n'a pas déjà été clos.
 *
 * Destinataires : les billets réellement scannés (`used`) et les invités ayant
 * répondu oui. On ne relance pas ceux qui ont acheté sans venir : leur écrire
 * « revoyez la soirée » serait au mieux maladroit.
 */
async function sendPostEventRecaps(env: Env): Promise<void> {
  const now = Date.now();
  const notBefore = new Date(now - RECAP_MAX_DAYS_AFTER_END * 24 * 3600 * 1000).toISOString();
  const notAfter = new Date(now - RECAP_MIN_HOURS_AFTER_END * 3600 * 1000).toISOString();

  const events = await env.DB.prepare(
    `SELECT e.id, e.title, e.public_slug, e.organizer_id,
            COALESCE(e.ends_at, e.starts_at) AS ended_at
     FROM events e
     WHERE e.status = 'published'
       AND e.recap_sent_at IS NULL
       AND COALESCE(e.ends_at, e.starts_at) BETWEEN ? AND ?
       AND EXISTS (SELECT 1 FROM media m WHERE m.event_id = e.id AND m.featured = 1)
     ORDER BY ended_at DESC
     LIMIT 20`,
  )
    .bind(notBefore, notAfter)
    .all<RecapEvent>();

  let budget = MAX_RECAPS_PER_RUN;
  for (const event of events.results) {
    if (budget <= 0) {
      console.log("[recap] plafond atteint, reliquat reporté à la prochaine exécution");
      return;
    }

    const galleryUrl = `${env.WEB_BASE_URL}/e/${event.public_slug}#photos`;
    const logoUrl = await eventLogoUrl(env, event.id);
    const brand = { logoUrl, eventTitle: event.title };
    const subject = `Les photos de ${event.title} sont en ligne`;
    const heading = `Revivez ${event.title}`;

    // Le prochain rendez-vous du même organisateur : c'est tout l'intérêt de
    // l'email. Sans lui, le message est une carte postale ; avec lui, c'est
    // une invitation.
    const next = await env.DB.prepare(
      `SELECT title, starts_at, public_slug FROM events
       WHERE organizer_id = ? AND status = 'published' AND id != ? AND starts_at > ?
       ORDER BY starts_at LIMIT 1`,
    )
      .bind(event.organizer_id, event.id, nowIso())
      .first<{ title: string; starts_at: string; public_slug: string }>();

    const nextBlock = next
      ? `<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0" />
         <p style="margin-bottom:8px"><strong>Le prochain rendez-vous</strong></p>
         <p style="margin-top:0">${esc(next.title)} — ${esc(formatEventDate(next.starts_at))}<br />
            <a href="${env.WEB_BASE_URL}/e/${esc(next.public_slug)}">Réserver ma place</a></p>`
      : `<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0" />
         <p><a href="${env.WEB_BASE_URL}/evenements">Découvrir les prochains événements</a></p>`;

    const body = (greeting: string) =>
      `<p>${greeting}</p>
       <p>Les photos de <strong>${esc(event.title)}</strong> viennent d'être mises en ligne.</p>
       <p><a href="${galleryUrl}">Voir la galerie</a></p>
       ${nextBlock}`;

    // On demande une ligne de plus que le budget : si elle arrive, c'est qu'il
    // reste du monde à servir et l'événement ne doit pas être clos.
    const tickets = await env.DB.prepare(
      `SELECT id, buyer_name, buyer_email FROM tickets
       WHERE event_id = ? AND status = 'used' AND recap_sent_at IS NULL
       ORDER BY created_at LIMIT ?`,
    )
      .bind(event.id, budget + 1)
      .all<{ id: string; buyer_name: string; buyer_email: string }>();
    const ticketsDrained = tickets.results.length <= budget;
    const ticketRows = tickets.results.slice(0, budget);
    budget -= ticketRows.length;

    await sendReminderBatch(
      env,
      ticketRows,
      async (t) => {
        const greeting = t.buyer_name ? `Bonjour ${esc(t.buyer_name)},` : "Bonjour,";
        await sendEmail(env, t.buyer_email, subject, layout(heading, body(greeting), brand), galleryUrl);
      },
      (t) => env.DB.prepare("UPDATE tickets SET recap_sent_at = ? WHERE id = ?").bind(nowIso(), t.id),
    );

    let guestRows: Array<{ id: string; name: string; email: string }> = [];
    // Budget épuisé avant d'avoir seulement interrogé les invités : on ne sait
    // rien de leur file, donc on ne la déclare surtout pas vide.
    let guestsDrained = false;
    if (budget > 0) {
      const guests = await env.DB.prepare(
        `SELECT id, name, email FROM guests
         WHERE event_id = ? AND email IS NOT NULL AND rsvp_status = 'yes' AND recap_sent_at IS NULL
         ORDER BY created_at LIMIT ?`,
      )
        .bind(event.id, budget + 1)
        .all<{ id: string; name: string; email: string }>();
      guestsDrained = guests.results.length <= budget;
      guestRows = guests.results.slice(0, budget);
      budget -= guestRows.length;

      await sendReminderBatch(
        env,
        guestRows,
        async (g) => {
          const greeting = g.name ? `Bonjour ${esc(g.name)},` : "Bonjour,";
          await sendEmail(env, g.email, subject, layout(heading, body(greeting), brand), galleryUrl);
        },
        (g) => env.DB.prepare("UPDATE guests SET recap_sent_at = ? WHERE id = ?").bind(nowIso(), g.id),
      );
    }

    // On ne clôt l'événement que si les deux files sont vides : sinon l'exécution
    // suivante reprendra les destinataires restants, marqueur par marqueur.
    if (ticketsDrained && guestsDrained) {
      await env.DB.prepare("UPDATE events SET recap_sent_at = ? WHERE id = ?").bind(nowIso(), event.id).run();
      console.log(`[recap] ${event.public_slug} : ${ticketRows.length + guestRows.length} destinataire(s)`);
    }
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
          ? Promise.allSettled([
              sendEventReminders(env),
              sendPostEventRecaps(env),
              releaseStalePendingTransactions(env),
            ]).then((results) => {
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
