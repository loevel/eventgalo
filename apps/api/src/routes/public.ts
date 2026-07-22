import { Hono } from "hono";
import Stripe from "stripe";
import type { AppContext } from "../types";
import { buildTicketPayload, nowIso, uuid, verifyTicketPayload } from "../lib/crypto";
import { eventLogoUrl, layout, sendEmail } from "../lib/email";
import { MAX_MEDIA_PER_EVENT, MAX_MEDIA_PER_GUEST, MEDIA_LIST_QUERY, validateMediaFile } from "../lib/media";
import { callEventDO, DOError } from "../do/event-do";
import { clientIp, isRateLimited, tooManyRequests } from "../lib/rate-limit";
import { sanitizeSocials, sanitizeVideoUrl } from "../lib/profile";
import { buildIcsEvent, icsResponse } from "../lib/ics";
import { getSetting } from "../lib/admin";
import { triggerWebhooks } from "../lib/webhooks";
import { organizerDestination, serviceFeeCents } from "../lib/stripe";
import { createNotification } from "../lib/notifications";
import { generateEventAnswer } from "../lib/ai";

const pub = new Hono<AppContext>();

const PUBLIC_EVENT_FIELDS = `id, title, description, starts_at, ends_at, venue, address,
  dress_code, capacity, public_slug, type, status, refund_policy, rsvp_question, cover_media_id, logo_media_id,
  agenda, created_at, parking_available, parking_details, accessibility_available, accessibility_details,
  age_restriction, age_restriction_details, day_of_phone, coat_check_available, coat_check_details`;

/* ---------------------------- Page publique ------------------------------ */

/** Bannière d'annonce site-wide, gérée depuis l'espace admin. */
pub.get("/settings/banner", async (c) => {
  const [enabled, kind, text, link] = await Promise.all([
    getSetting(c.env, "banner_enabled"),
    getSetting(c.env, "banner_kind"),
    getSetting(c.env, "banner_text"),
    getSetting(c.env, "banner_link"),
  ]);
  if (enabled !== "1" || !text) return c.json({ enabled: false });
  return c.json({ enabled: true, kind, text, link: link || null });
});

// Liste des événements publiés (slug + date de mise à jour) — utilisée par le sitemap du site web
pub.get("/events", async (c) => {
  const events = await c.env.DB.prepare(
    "SELECT public_slug, updated_at FROM events WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1000",
  ).all();
  return c.json({ events: events.results });
});

pub.get("/events/:slug", async (c) => {
  const event = await c.env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_FIELDS} FROM events WHERE public_slug = ? AND status = 'published'`,
  )
    .bind(c.req.param("slug"))
    .first();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const [categories, announcements, gallery, sponsors, performers] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, name, description, perks, price_cents, currency, quantity, sold FROM ticket_categories WHERE event_id = ? ORDER BY price_cents",
    ).bind(event.id).all(),
    c.env.DB.prepare("SELECT body, created_at FROM announcements WHERE event_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(event.id).all(),
    c.env.DB.prepare(
      "SELECT id, content_type FROM media WHERE event_id = ? AND featured = 1 ORDER BY created_at DESC LIMIT 12",
    ).bind(event.id).all(),
    c.env.DB.prepare(
      `SELECT s.id, s.company_name, s.website, s.logo_media_id, s.description, s.address, s.phone,
              s.public_email, s.video_url, s.socials,
              t.name AS tier_name, t.rank AS tier_rank, t.showcase
       FROM sponsors s JOIN sponsor_tiers t ON t.id = s.tier_id
       WHERE s.event_id = ? AND s.status = 'confirmed' AND s.company_name IS NOT NULL
       ORDER BY t.rank, t.price_cents DESC, s.confirmed_at`,
    ).bind(event.id).all<{ id: string; showcase: string; [k: string]: unknown }>(),
    c.env.DB.prepare(
      "SELECT id, name, role, bio, photo1_media_id, photo2_media_id FROM event_performers WHERE event_id = ? ORDER BY rank, created_at",
    ).bind(event.id).all(),
  ]);
  // Photos de vitrine des sponsors « full » uniquement (le niveau d'affichage dépend du palier).
  const fullIds = sponsors.results.filter((s) => s.showcase === "full").map((s) => s.id);
  let sponsorPhotos: Array<{ id: string; sponsor_id: string }> = [];
  if (fullIds.length) {
    const placeholders = fullIds.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT id, sponsor_id FROM media WHERE sponsor_id IN (${placeholders}) ORDER BY created_at`,
    )
      .bind(...fullIds)
      .all<{ id: string; sponsor_id: string }>();
    sponsorPhotos = rows.results;
  }
  return c.json({
    event,
    categories: categories.results,
    announcements: announcements.results,
    gallery: gallery.results,
    sponsors: sponsors.results.map(({ id, ...s }) => ({
      ...s,
      photos: sponsorPhotos.filter((p) => p.sponsor_id === id).map((p) => p.id),
    })),
    performers: performers.results,
  });
});

/** Assistant IA public : répond aux questions des invités à partir des infos publiées de l'événement. */
pub.post("/events/:slug/ask", async (c) => {
  if (await isRateLimited(c.env, "ai-ask", clientIp(c), 15, 3600)) return tooManyRequests(c);

  const body = await c.req.json<{ question?: string }>().catch(() => ({}) as Record<string, never>);
  const question = (body.question ?? "").trim().slice(0, 300);
  if (question.length < 3) return c.json({ error: "Question trop courte." }, 400);

  const event = await c.env.DB.prepare(
    `SELECT title, description, starts_at, ends_at, venue, address, dress_code, type,
       parking_available, parking_details, accessibility_available, accessibility_details,
       age_restriction, age_restriction_details, day_of_phone, coat_check_available, coat_check_details, agenda, id
     FROM events WHERE public_slug = ? AND status = 'published'`,
  )
    .bind(c.req.param("slug"))
    .first<{
      title: string;
      description: string | null;
      starts_at: string | null;
      ends_at: string | null;
      venue: string | null;
      address: string | null;
      dress_code: string | null;
      type: string;
      parking_available: number;
      parking_details: string | null;
      accessibility_available: number;
      accessibility_details: string | null;
      age_restriction: string;
      age_restriction_details: string | null;
      day_of_phone: string | null;
      coat_check_available: number;
      coat_check_details: string | null;
      agenda: string | null;
      id: string;
    }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);

  let agenda: Array<{ time: string; label: string }> = [];
  if (event.agenda) {
    try {
      const parsed = JSON.parse(event.agenda);
      if (Array.isArray(parsed)) agenda = parsed;
    } catch {
      // agenda mal formé : on l'ignore silencieusement dans le contexte fourni à l'IA
    }
  }

  const categories = await c.env.DB.prepare(
    "SELECT name, price_cents, currency FROM ticket_categories WHERE event_id = ? ORDER BY price_cents",
  )
    .bind(event.id)
    .all<{ name: string; price_cents: number; currency: string }>();

  const answer = await generateEventAnswer(
    c.env,
    {
      title: event.title,
      description: event.description,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      venue: event.venue,
      address: event.address,
      dressCode: event.dress_code,
      eventType: event.type as "private" | "ticketed",
      parkingAvailable: Boolean(event.parking_available),
      parkingDetails: event.parking_details,
      accessibilityAvailable: Boolean(event.accessibility_available),
      accessibilityDetails: event.accessibility_details,
      ageRestriction: event.age_restriction,
      ageRestrictionDetails: event.age_restriction_details,
      dayOfPhone: event.day_of_phone,
      coatCheckAvailable: Boolean(event.coat_check_available),
      coatCheckDetails: event.coat_check_details,
      agenda,
      categories: categories.results.map((cat) => ({ name: cat.name, priceCents: cat.price_cents, currency: cat.currency })),
    },
    question,
  );
  return c.json({ answer });
});

/* ------------------------- Espace sponsor (lien privé) --------------------- */

const MAX_SPONSOR_PHOTOS = 6;

/** L'événement est-il passé ? (fin si connue, sinon début) */
export function eventIsPast(ev: { starts_at?: unknown; ends_at?: unknown }): boolean {
  const ref = (ev.ends_at as string | null) ?? (ev.starts_at as string | null);
  return Boolean(ref) && String(ref) < nowIso();
}

pub.get("/sponsor/:token", async (c) => {
  const sponsor = await c.env.DB.prepare("SELECT * FROM sponsors WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string; tier_id: string | null; status: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  const [event, tiers, taken, photos, myReview] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, title, description, starts_at, ends_at, venue, address, public_slug, cover_media_id, logo_media_id
       FROM events WHERE id = ? AND status != 'archived'`,
    ).bind(sponsor.event_id).first(),
    c.env.DB.prepare("SELECT * FROM sponsor_tiers WHERE event_id = ? ORDER BY rank, price_cents DESC")
      .bind(sponsor.event_id).all(),
    c.env.DB.prepare(
      `SELECT tier_id, COUNT(*) AS n FROM sponsors
       WHERE event_id = ? AND status IN ('pending','confirmed') AND tier_id IS NOT NULL GROUP BY tier_id`,
    ).bind(sponsor.event_id).all<{ tier_id: string; n: number }>(),
    c.env.DB.prepare("SELECT id FROM media WHERE sponsor_id = ? ORDER BY created_at").bind(sponsor.id).all(),
    c.env.DB.prepare("SELECT rating, comment FROM sponsor_reviews WHERE sponsor_id = ? AND rated_by = 'company'")
      .bind(sponsor.id).first<{ rating: number; comment: string | null }>(),
  ]);
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const { token: _token, ...safeSponsor } = sponsor as Record<string, unknown>;
  return c.json({
    sponsor: safeSponsor,
    event,
    tiers: tiers.results,
    taken: taken.results,
    photos: photos.results,
    my_review: myReview ?? null,
    event_past: eventIsPast(event as { starts_at?: unknown; ends_at?: unknown }),
    stripe_enabled: Boolean(c.env.STRIPE_SECRET_KEY),
  });
});

/** Vitrine du sponsor : description, contacts, vidéo, réseaux sociaux. */
pub.patch("/sponsor/:token/profile", async (c) => {
  const sponsor = await c.env.DB.prepare("SELECT id, status FROM sponsors WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; status: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (!["pending", "confirmed"].includes(sponsor.status)) {
    return c.json({ error: "Engagez-vous d'abord sur un palier" }, 409);
  }
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const clamp = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const videoUrl = sanitizeVideoUrl(b.video_url);
  if (b.video_url && typeof b.video_url === "string" && b.video_url.trim() && !videoUrl) {
    return c.json({ error: "Vidéo : seuls les liens YouTube et Vimeo sont acceptés" }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE sponsors SET description = ?, address = ?, phone = ?, public_email = ?, website = ?,
       video_url = ?, socials = ? WHERE id = ?`,
  )
    .bind(
      clamp(b.description, 1200), clamp(b.address, 300), clamp(b.phone, 40),
      clamp(b.public_email, 120), clamp(b.website, 300),
      videoUrl, sanitizeSocials(b.socials), sponsor.id,
    )
    .run();
  return c.json({ ok: true });
});

/** Photos de la vitrine (max 6 par sponsor). */
pub.post("/sponsor/:token/media", async (c) => {
  const sponsor = await c.env.DB.prepare("SELECT id, event_id, status FROM sponsors WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string; status: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (!["pending", "confirmed"].includes(sponsor.status)) {
    return c.json({ error: "Engagez-vous d'abord sur un palier" }, 409);
  }
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE sponsor_id = ?")
    .bind(sponsor.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SPONSOR_PHOTOS) {
    return c.json({ error: `Maximum ${MAX_SPONSOR_PHOTOS} photos — supprimez-en une d'abord` }, 409);
  }
  const id = uuid();
  const key = `events/${sponsor.event_id}/${id}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare(
    "INSERT INTO media (id, event_id, guest_id, sponsor_id, r2_key, content_type) VALUES (?, ?, NULL, ?, ?, ?)",
  )
    .bind(id, sponsor.event_id, sponsor.id, key, file.type)
    .run();
  return c.json({ media_id: id }, 201);
});

pub.delete("/sponsor/:token/media/:mid", async (c) => {
  const sponsor = await c.env.DB.prepare("SELECT id FROM sponsors WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  const media = await c.env.DB.prepare("SELECT id, r2_key FROM media WHERE id = ? AND sponsor_id = ?")
    .bind(c.req.param("mid"), sponsor.id)
    .first<{ id: string; r2_key: string }>();
  if (!media) return c.json({ error: "Photo introuvable" }, 404);
  await c.env.MEDIA.delete(media.r2_key);
  await c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(media.id).run();
  return c.json({ ok: true });
});

/** Engagement de l'entreprise : choix du palier + informations société. */
pub.post("/sponsor/:token", async (c) => {
  const sponsor = await c.env.DB.prepare("SELECT * FROM sponsors WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string; status: string; contact_email: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (sponsor.status === "confirmed") return c.json({ error: "Sponsoring déjà confirmé" }, 409);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const tierId = String(b.tier_id ?? "");
  const companyName = String(b.company_name ?? "").trim();
  if (!tierId || !companyName) return c.json({ error: "Palier et nom de l'entreprise requis" }, 400);
  const tier = await c.env.DB.prepare("SELECT * FROM sponsor_tiers WHERE id = ? AND event_id = ?")
    .bind(tierId, sponsor.event_id)
    .first<{ id: string; name: string; price_cents: number; quantity: number }>();
  if (!tier) return c.json({ error: "Palier introuvable" }, 404);
  const taken = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sponsors WHERE tier_id = ? AND status IN ('pending','confirmed') AND id != ?",
  )
    .bind(tier.id, sponsor.id)
    .first<{ n: number }>();
  if ((taken?.n ?? 0) >= tier.quantity) {
    return c.json({ error: "Ce palier est complet — choisissez-en un autre" }, 409);
  }
  await c.env.DB.prepare(
    `UPDATE sponsors SET tier_id = ?, company_name = ?, website = ?, contact_name = COALESCE(?, contact_name),
       message = ?, amount_cents = ?, status = 'pending', committed_at = ? WHERE id = ?`,
  )
    .bind(
      tier.id, companyName, (b.website as string) || null, (b.contact_name as string) || null,
      (b.message as string) || null, tier.price_cents, nowIso(), sponsor.id,
    )
    .run();

  // Vitrine par défaut : si un profil entreprise correspond au contact (rattaché ou
  // même email de compte), on le lie et on préremplit les champs vitrine manquants.
  const co = await c.env.DB.prepare(
    `SELECT co.id, co.description, co.city, co.phone, co.public_email, co.socials, co.video_url
     FROM companies co JOIN users u ON u.id = co.owner_user_id
     WHERE co.id = (SELECT company_id FROM sponsors WHERE id = ?) OR u.email = ?
     LIMIT 1`,
  )
    .bind(sponsor.id, sponsor.contact_email)
    .first<{
      id: string; description: string | null; city: string | null; phone: string | null;
      public_email: string | null; socials: string | null; video_url: string | null;
    }>();
  if (co) {
    await c.env.DB.prepare(
      `UPDATE sponsors SET company_id = ?,
         description = COALESCE(description, ?), address = COALESCE(address, ?),
         phone = COALESCE(phone, ?), public_email = COALESCE(public_email, ?),
         socials = COALESCE(socials, ?), video_url = COALESCE(video_url, ?)
       WHERE id = ?`,
    )
      .bind(co.id, co.description, co.city, co.phone, co.public_email, co.socials, co.video_url, sponsor.id)
      .run();
  }

  // Récapitulatif à l'organisateur : nouvel engagement à examiner.
  c.executionCtx.waitUntil(
    (async () => {
      const org = await c.env.DB.prepare(
        `SELECT u.id AS user_id, u.email, e.title, e.id AS event_id
         FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = ?`,
      )
        .bind(sponsor.event_id)
        .first<{ user_id: string; email: string; title: string; event_id: string }>();
      if (!org) return;
      const amount = (tier.price_cents / 100).toFixed(2);
      await sendEmail(
        c.env,
        org.email,
        `Nouvel engagement sponsor — ${org.title}`,
        layout(
          `${companyName} veut sponsoriser ${org.title} !`,
          `<p><strong>${companyName}</strong> vient de s'engager sur le palier
             <strong>${tier.name}</strong> (${amount}&nbsp;$).</p>
           <ul style="color:#444;padding-left:18px">
             <li>Contact : ${(b.contact_name as string) || "—"} · ${sponsor.contact_email}</li>
             ${b.website ? `<li>Site web : ${b.website}</li>` : ""}
             ${b.message ? `<li>Message : « ${b.message} »</li>` : ""}
           </ul>
           <p>Le sponsor peut payer en ligne, ou vous pouvez confirmer manuellement après réception du
              paiement (virement/facture) depuis l'onglet Sponsors de votre tableau de bord.</p>
           <p><a href="${c.env.WEB_BASE_URL}/dashboard/e/${org.event_id}">Ouvrir le tableau de bord</a></p>`,
          { logoUrl: await eventLogoUrl(c.env, sponsor.event_id), eventTitle: org.title },
        ),
      );
      await createNotification(c.env, org.user_id, {
        type: "sponsor_engagement",
        title: `${companyName} veut sponsoriser ${org.title}`,
        body: `Palier ${tier.name} (${amount} $)`,
        link: `/dashboard/e/${org.event_id}`,
      });
    })(),
  );
  return c.json({ ok: true, status: "pending", tier_name: tier.name, amount_cents: tier.price_cents });
});

/** Paiement en ligne du sponsoring (Stripe Checkout). */
pub.post("/sponsor/:token/checkout", async (c) => {
  const sponsor = await c.env.DB.prepare(
    `SELECT s.*, t.name AS tier_name, t.currency, e.title AS event_title, e.organizer_id
     FROM sponsors s JOIN sponsor_tiers t ON t.id = s.tier_id JOIN events e ON e.id = s.event_id
     WHERE s.token = ?`,
  )
    .bind(c.req.param("token"))
    .first<{
      id: string; event_id: string; status: string; amount_cents: number | null; paid_at: string | null;
      contact_email: string; company_name: string | null; tier_name: string; currency: string; event_title: string;
      organizer_id: string;
    }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (sponsor.status !== "pending") return c.json({ error: "Engagement requis avant le paiement" }, 409);
  if (sponsor.paid_at) return c.json({ error: "Sponsoring déjà payé" }, 409);
  if ((sponsor as { proposal_status?: string | null }).proposal_status === "pending") {
    return c.json({ error: "Votre contre-proposition est en cours d'examen — attendez la réponse de l'organisation" }, 409);
  }
  if (!sponsor.amount_cents || sponsor.amount_cents <= 0) return c.json({ error: "Montant invalide" }, 400);
  if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "Paiement en ligne indisponible" }, 501);

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  // Destination charge si l'organisateur est activé sur Connect : il reçoit
  // 100 % du montant du palier, l'entreprise paie les frais de service.
  const destination = await organizerDestination(c.env, sponsor.organizer_id);
  const fee = destination ? await serviceFeeCents(c.env, sponsor.amount_cents, 1) : 0;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: sponsor.contact_email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: sponsor.currency.toLowerCase(),
          unit_amount: sponsor.amount_cents,
          product_data: {
            name: `Sponsoring ${sponsor.tier_name} — ${sponsor.event_title}`,
            ...(sponsor.company_name ? { description: `Au nom de ${sponsor.company_name}` } : {}),
          },
        },
      },
      ...(fee > 0
        ? [
            {
              quantity: 1,
              price_data: {
                currency: sponsor.currency.toLowerCase(),
                unit_amount: fee,
                product_data: { name: "Frais de service EventGalo" },
              },
            },
          ]
        : []),
    ],
    ...(destination
      ? { payment_intent_data: { application_fee_amount: fee, transfer_data: { destination } } }
      : {}),
    metadata: { sponsor_id: sponsor.id, event_id: sponsor.event_id },
    success_url: `${c.env.WEB_BASE_URL}/sp/${c.req.param("token")}?paid=1`,
    cancel_url: `${c.env.WEB_BASE_URL}/sp/${c.req.param("token")}?canceled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  await c.env.DB.prepare("UPDATE sponsors SET stripe_session_id = ? WHERE id = ?")
    .bind(session.id, sponsor.id)
    .run();
  return c.json({ checkout_url: session.url });
});

/**
 * Contre-proposition : l'entreprise propose un montant différent du palier.
 * L'organisateur accepte (le montant engagé est remplacé) ou refuse depuis son
 * tableau de bord. Une seule contre-proposition à la fois.
 */
pub.post("/sponsor/:token/propose", async (c) => {
  const sponsor = await c.env.DB.prepare(
    `SELECT s.id, s.event_id, s.status, s.paid_at, s.amount_cents, s.company_name, s.proposal_status,
            t.name AS tier_name, e.title AS event_title
     FROM sponsors s LEFT JOIN sponsor_tiers t ON t.id = s.tier_id JOIN events e ON e.id = s.event_id
     WHERE s.token = ?`,
  )
    .bind(c.req.param("token"))
    .first<{
      id: string; event_id: string; status: string; paid_at: string | null; amount_cents: number | null;
      company_name: string | null; proposal_status: string | null; tier_name: string | null; event_title: string;
    }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (sponsor.status !== "pending") return c.json({ error: "Engagez-vous d'abord sur un palier" }, 409);
  if (sponsor.paid_at) return c.json({ error: "Sponsoring déjà payé" }, 409);
  if (sponsor.proposal_status === "pending") {
    return c.json({ error: "Une contre-proposition est déjà en cours d'examen" }, 409);
  }

  const b = await c.req.json<{ amount_cents?: number; message?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const proposed = Math.round(Number(b.amount_cents ?? 0));
  if (!Number.isFinite(proposed) || proposed <= 0) return c.json({ error: "Montant proposé invalide" }, 400);
  if (proposed === sponsor.amount_cents) {
    return c.json({ error: "Le montant proposé est identique au montant actuel" }, 400);
  }
  const message = typeof b.message === "string" && b.message.trim() ? b.message.trim().slice(0, 800) : null;

  await c.env.DB.prepare(
    `UPDATE sponsors SET proposed_cents = ?, proposed_message = ?, proposed_at = ?, proposal_status = 'pending'
     WHERE id = ?`,
  )
    .bind(proposed, message, nowIso(), sponsor.id)
    .run();

  c.executionCtx.waitUntil(
    (async () => {
      const org = await c.env.DB.prepare(
        "SELECT u.id AS user_id, u.email FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = ?",
      )
        .bind(sponsor.event_id)
        .first<{ user_id: string; email: string }>();
      if (!org) return;
      const company = sponsor.company_name ?? "Une entreprise";
      await sendEmail(
        c.env,
        org.email,
        `Contre-proposition de sponsoring — ${sponsor.event_title}`,
        layout(
          `${company} propose un autre montant`,
          `<p><strong>${company}</strong> souhaite sponsoriser <strong>${sponsor.event_title}</strong>
             (palier <strong>${sponsor.tier_name ?? ""}</strong>) pour
             <strong>${(proposed / 100).toFixed(2)}&nbsp;$</strong> au lieu de
             ${sponsor.amount_cents != null ? `${(sponsor.amount_cents / 100).toFixed(2)}&nbsp;$` : "—"}.</p>
           ${message ? `<p style="border-left:3px solid #f2c078;padding-left:12px;color:#555">« ${message} »</p>` : ""}
           <p>Acceptez ou refusez cette proposition depuis l'onglet Sponsors de votre tableau de bord :</p>
           <p><a href="${c.env.WEB_BASE_URL}/dashboard/e/${sponsor.event_id}">Ouvrir le tableau de bord</a></p>`,
          { logoUrl: await eventLogoUrl(c.env, sponsor.event_id), eventTitle: sponsor.event_title },
        ),
      );
      await createNotification(c.env, org.user_id, {
        type: "sponsor_proposal",
        title: `${company} propose un autre montant — ${sponsor.event_title}`,
        body: `${(proposed / 100).toFixed(2)} $ proposé (palier ${sponsor.tier_name ?? ""})`,
        link: `/dashboard/e/${sponsor.event_id}`,
      });
    })(),
  );
  return c.json({ ok: true, proposal_status: "pending", proposed_cents: proposed });
});

/**
 * Évaluation de l'organisation par l'entreprise, après l'événement.
 * Une note par engagement, modifiable (upsert sur sponsor_id + rated_by).
 */
pub.post("/sponsor/:token/review", async (c) => {
  const sponsor = await c.env.DB.prepare(
    `SELECT s.id, s.status, e.starts_at, e.ends_at FROM sponsors s JOIN events e ON e.id = s.event_id
     WHERE s.token = ?`,
  )
    .bind(c.req.param("token"))
    .first<{ id: string; status: string; starts_at: string | null; ends_at: string | null }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (sponsor.status !== "confirmed") return c.json({ error: "Seul un sponsoring confirmé peut être évalué" }, 409);
  if (!eventIsPast(sponsor)) return c.json({ error: "Vous pourrez évaluer l'organisation après l'événement" }, 409);

  const b = await c.req.json<{ rating?: number; comment?: string }>().catch(() => ({}) as Record<string, never>);
  const rating = Math.round(Number(b.rating ?? 0));
  if (rating < 1 || rating > 5) return c.json({ error: "Note entre 1 et 5 requise" }, 400);
  const comment = typeof b.comment === "string" && b.comment.trim() ? b.comment.trim().slice(0, 800) : null;

  await c.env.DB.prepare(
    `INSERT INTO sponsor_reviews (id, sponsor_id, rated_by, rating, comment) VALUES (?, ?, 'company', ?, ?)
     ON CONFLICT (sponsor_id, rated_by) DO UPDATE SET rating = excluded.rating, comment = excluded.comment`,
  )
    .bind(uuid(), sponsor.id, rating, comment)
    .run();
  return c.json({ ok: true, rating });
});

/** L'entreprise décline la proposition de sponsoring. */
pub.post("/sponsor/:token/decline", async (c) => {
  const sponsor = await c.env.DB.prepare(
    `SELECT s.id, s.event_id, s.status, s.company_name, e.title AS event_title
     FROM sponsors s JOIN events e ON e.id = s.event_id WHERE s.token = ?`,
  )
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string; status: string; company_name: string | null; event_title: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  if (sponsor.status === "confirmed") return c.json({ error: "Sponsoring déjà confirmé — contactez l'organisation" }, 409);
  await c.env.DB.prepare("UPDATE sponsors SET status = 'declined' WHERE id = ?").bind(sponsor.id).run();

  c.executionCtx.waitUntil(
    (async () => {
      const org = await c.env.DB.prepare(
        `SELECT u.id AS user_id, u.email FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = ?`,
      )
        .bind(sponsor.event_id)
        .first<{ user_id: string; email: string }>();
      if (!org) return;
      await sendEmail(
        c.env,
        org.email,
        `Proposition déclinée — ${sponsor.event_title}`,
        layout(
          "Proposition de sponsoring déclinée",
          `<p>${sponsor.company_name ? `<strong>${sponsor.company_name}</strong>` : "L'entreprise contactée"}
             a décliné la proposition de sponsoring pour <strong>${sponsor.event_title}</strong>.</p>
           <p>Vous pouvez explorer d'autres entreprises dans
             <a href="${c.env.WEB_BASE_URL}/sponsors">l'annuaire des sponsors</a>.</p>`,
          { logoUrl: await eventLogoUrl(c.env, sponsor.event_id), eventTitle: sponsor.event_title },
        ),
      );
      await createNotification(c.env, org.user_id, {
        type: "sponsor_declined",
        title: `Proposition déclinée — ${sponsor.event_title}`,
        body: sponsor.company_name ? `${sponsor.company_name} a décliné.` : "L'entreprise contactée a décliné.",
        link: `/dashboard/e/${sponsor.event_id}`,
      });
    })(),
  );
  c.executionCtx.waitUntil(
    triggerWebhooks(c.env, sponsor.event_id, "sponsor.declined", {
      sponsor_id: sponsor.id,
      company_name: sponsor.company_name,
    }),
  );
  return c.json({ ok: true, status: "declined" });
});

/** Upload du logo de l'entreprise sponsor. */
pub.post("/sponsor/:token/logo", async (c) => {
  const sponsor = await c.env.DB.prepare("SELECT id, event_id FROM sponsors WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string }>();
  if (!sponsor) return c.json({ error: "Lien de sponsoring introuvable" }, 404);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);
  const id = uuid();
  const key = `events/${sponsor.event_id}/${id}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, NULL, ?, ?)")
      .bind(id, sponsor.event_id, key, file.type),
    c.env.DB.prepare("UPDATE sponsors SET logo_media_id = ? WHERE id = ?").bind(id, sponsor.id),
  ]);
  return c.json({ media_id: id }, 201);
});

pub.get("/events/:slug/ics", async (c) => {
  const event = await c.env.DB.prepare(
    `SELECT id, title, description, starts_at, ends_at, venue, address, public_slug
     FROM events WHERE public_slug = ? AND status = 'published'`,
  )
    .bind(c.req.param("slug"))
    .first<{
      id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
      venue: string | null; address: string | null; public_slug: string;
    }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const ics = buildIcsEvent({
    uid: event.id,
    title: event.title,
    description: event.description,
    location: [event.venue, event.address].filter(Boolean).join(", ") || null,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    url: `https://eventgalo.com/e/${event.public_slug}`,
  });
  return icsResponse(ics, event.public_slug);
});

/* --------------------------- Invitation / RSVP --------------------------- */

pub.get("/invite/:token", async (c) => {
  const guest = await c.env.DB.prepare("SELECT * FROM guests WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ id: string; event_id: string; opened_at: string | null }>();
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  if (!guest.opened_at) {
    await c.env.DB.prepare("UPDATE guests SET opened_at = ? WHERE id = ?").bind(nowIso(), guest.id).run();
  }
  const event = await c.env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_FIELDS}, seating_plan FROM events WHERE id = ? AND status != 'archived'`,
  )
    .bind(guest.event_id)
    .first();
  if (!event) return c.json({ error: "Événement archivé" }, 410);
  const announcements = await c.env.DB.prepare(
    "SELECT body, created_at FROM announcements WHERE event_id = ? ORDER BY created_at DESC LIMIT 20",
  ).bind(guest.event_id).all();
  return c.json({ guest, event, announcements: announcements.results });
});

pub.get("/invite/:token/ics", async (c) => {
  const guest = await c.env.DB.prepare("SELECT event_id FROM guests WHERE token = ?")
    .bind(c.req.param("token"))
    .first<{ event_id: string }>();
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  const event = await c.env.DB.prepare(
    `SELECT id, title, description, starts_at, ends_at, venue, address, public_slug
     FROM events WHERE id = ? AND status != 'archived'`,
  )
    .bind(guest.event_id)
    .first<{
      id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
      venue: string | null; address: string | null; public_slug: string;
    }>();
  if (!event) return c.json({ error: "Événement archivé" }, 410);
  const ics = buildIcsEvent({
    uid: event.id,
    title: event.title,
    description: event.description,
    location: [event.venue, event.address].filter(Boolean).join(", ") || null,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    url: `https://eventgalo.com/e/${event.public_slug}`,
  });
  return icsResponse(ics, event.public_slug);
});

// Permet à l'invité de corriger ses propres coordonnées (nom, email, téléphone).
pub.patch("/invite/:token", async (c) => {
  if (await isRateLimited(c.env, "invite-edit", clientIp(c), 20, 60)) return tooManyRequests(c);
  const token = c.req.param("token");
  const existing = await c.env.DB.prepare("SELECT id FROM guests WHERE token = ?").bind(token).first<{ id: string }>();
  if (!existing) return c.json({ error: "Invitation introuvable" }, 404);

  const b = await c.req.json<{ name?: string; email?: string | null; phone?: string | null }>().catch(() => ({}) as Record<string, never>);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return c.json({ error: "Le nom ne peut pas être vide" }, 400);
    sets.push("name = ?");
    values.push(name);
  }
  if (b.email !== undefined) {
    const email = b.email ? String(b.email).trim().toLowerCase() : "";
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Adresse email invalide" }, 400);
    sets.push("email = ?");
    values.push(email || null);
  }
  if (b.phone !== undefined) {
    sets.push("phone = ?");
    values.push(b.phone ? String(b.phone).trim() : null);
  }
  if (!sets.length) return c.json({ error: "Aucun champ à modifier" }, 400);
  values.push(token);
  await c.env.DB.prepare(`UPDATE guests SET ${sets.join(", ")} WHERE token = ?`).bind(...values).run();
  const guest = await c.env.DB.prepare("SELECT * FROM guests WHERE token = ?").bind(token).first();
  return c.json({ guest });
});

pub.post("/invite/:token/rsvp", async (c) => {
  // 20 requêtes / min par IP : un lien peut être partagé en famille, on reste généreux.
  if (await isRateLimited(c.env, "rsvp", clientIp(c), 20, 60)) return tooManyRequests(c);
  const b = await c.req.json<{ status?: string; consent?: boolean; note?: string }>().catch(() => ({}) as Record<string, never>);
  if (b.status !== "yes" && b.status !== "no") return c.json({ error: "Statut invalide" }, 400);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : undefined;
  const res = await c.env.DB.prepare(
    `UPDATE guests SET rsvp_status = ?, rsvp_at = ?, consent_at = COALESCE(consent_at, ?)
     ${note !== undefined ? ", rsvp_note = ?" : ""}
     WHERE token = ?`,
  )
    .bind(
      ...(note !== undefined
        ? [b.status, nowIso(), b.consent ? nowIso() : null, note || null, c.req.param("token")]
        : [b.status, nowIso(), b.consent ? nowIso() : null, c.req.param("token")]),
    )
    .run();
  if (res.meta.changes === 0) return c.json({ error: "Invitation introuvable" }, 404);
  return c.json({ ok: true, status: b.status });
});

/* ------------------------------ Photos (média) ---------------------------- */

async function getGuestByToken(env: AppContext["Bindings"], token: string) {
  return env.DB.prepare(
    `SELECT g.id, g.event_id, e.status AS event_status
     FROM guests g JOIN events e ON e.id = g.event_id
     WHERE g.token = ?`,
  )
    .bind(token)
    .first<{ id: string; event_id: string; event_status: string }>();
}

pub.post("/invite/:token/media", async (c) => {
  const guest = await getGuestByToken(c.env, c.req.param("token"));
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  if (guest.event_status === "archived") return c.json({ error: "Événement archivé" }, 410);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);

  const [byGuest, byEvent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE guest_id = ?").bind(guest.id).first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE event_id = ?").bind(guest.event_id).first<{ n: number }>(),
  ]);
  if ((byGuest?.n ?? 0) >= MAX_MEDIA_PER_GUEST) {
    return c.json({ error: `Limite de ${MAX_MEDIA_PER_GUEST} photos atteinte` }, 409);
  }
  if ((byEvent?.n ?? 0) >= MAX_MEDIA_PER_EVENT) {
    return c.json({ error: "La galerie de cet événement est pleine" }, 409);
  }

  const id = uuid();
  const key = `events/${guest.event_id}/${id}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare(
    "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, guest.event_id, guest.id, key, file.type)
    .run();
  return c.json({ media: { id, guest_id: guest.id, content_type: file.type } }, 201);
});

pub.get("/invite/:token/media", async (c) => {
  const guest = await getGuestByToken(c.env, c.req.param("token"));
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  const rows = await c.env.DB.prepare(MEDIA_LIST_QUERY).bind(guest.event_id).all();
  return c.json({ media: rows.results, guest_id: guest.id });
});

pub.delete("/invite/:token/media/:mid", async (c) => {
  const guest = await getGuestByToken(c.env, c.req.param("token"));
  if (!guest) return c.json({ error: "Invitation introuvable" }, 404);
  const media = await c.env.DB.prepare("SELECT id, r2_key FROM media WHERE id = ? AND guest_id = ?")
    .bind(c.req.param("mid"), guest.id)
    .first<{ id: string; r2_key: string }>();
  if (!media) return c.json({ error: "Photo introuvable" }, 404);
  await c.env.MEDIA.delete(media.r2_key);
  await c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(media.id).run();
  return c.json({ ok: true });
});

/** Sert le fichier depuis R2 (id UUID non devinable, même modèle que les tokens). */
pub.get("/media/:id/file", async (c) => {
  const media = await c.env.DB.prepare("SELECT r2_key, content_type FROM media WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string; content_type: string }>();
  if (!media) return c.json({ error: "Photo introuvable" }, 404);
  const obj = await c.env.MEDIA.get(media.r2_key);
  if (!obj) return c.json({ error: "Photo introuvable" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": media.content_type,
      "Cache-Control": "private, max-age=3600",
      ETag: obj.httpEtag,
    },
  });
});

/* --------------------------------- Vendeur -------------------------------- */

pub.get("/seller/:code", async (c) => {
  const seller = await c.env.DB.prepare("SELECT id, event_id, name, code FROM sellers WHERE code = ?")
    .bind(c.req.param("code"))
    .first<{ id: string; event_id: string; name: string; code: string }>();
  if (!seller) return c.json({ error: "Code vendeur introuvable" }, 404);
  const event = await c.env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_FIELDS} FROM events WHERE id = ? AND status != 'archived'`,
  ).bind(seller.event_id).first();
  if (!event) return c.json({ error: "Événement archivé" }, 410);
  const categories = await c.env.DB.prepare(
    `SELECT tc.id, tc.name, tc.perks, tc.price_cents, tc.currency, tc.quantity, tc.sold,
            q.quota, q.sold AS seller_sold
     FROM ticket_categories tc
     LEFT JOIN seller_quotas q ON q.category_id = tc.id AND q.seller_id = ?
     WHERE tc.event_id = ? ORDER BY tc.price_cents`,
  ).bind(seller.id, seller.event_id).all();
  return c.json({ seller: { name: seller.name, code: seller.code }, event, categories: categories.results });
});

/** Tableau de bord vendeur : uniquement SES ventes (cloisonnement des données). */
pub.get("/seller/:code/stats", async (c) => {
  const seller = await c.env.DB.prepare("SELECT id, event_id, name FROM sellers WHERE code = ?")
    .bind(c.req.param("code"))
    .first<{ id: string; event_id: string; name: string }>();
  if (!seller) return c.json({ error: "Code vendeur introuvable" }, 404);
  const [quotas, mySales] = await Promise.all([
    c.env.DB.prepare(
      `SELECT q.quota, q.sold, tc.name AS category_name, tc.price_cents, tc.currency
       FROM seller_quotas q JOIN ticket_categories tc ON tc.id = q.category_id
       WHERE q.seller_id = ?`,
    ).bind(seller.id).all(),
    c.env.DB.prepare(
      `SELECT t.serial, t.buyer_name, t.status, tc.name AS category_name, t.created_at
       FROM tickets t JOIN ticket_categories tc ON tc.id = t.category_id
       WHERE t.seller_id = ? ORDER BY t.created_at DESC`,
    ).bind(seller.id).all(),
  ]);
  return c.json({ seller: { name: seller.name }, quotas: quotas.results, sales: mySales.results });
});

/* -------------------------------- Checkout -------------------------------- */

pub.post("/checkout", async (c) => {
  // 10 requêtes / min par IP : limite les tentatives d'épuisement de quota ou de fraude.
  if (await isRateLimited(c.env, "checkout", clientIp(c), 10, 60)) return tooManyRequests(c);
  const b = await c.req
    .json<{
      slug?: string; category_id?: string; quantity?: number;
      buyer_name?: string; buyer_email?: string; seller_code?: string; consent?: boolean;
    }>()
    .catch(() => ({}) as Record<string, never>);
  const buyerName = String(b.buyer_name ?? "").trim();
  const buyerEmail = String(b.buyer_email ?? "").trim().toLowerCase();
  if (!buyerName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
    return c.json({ error: "Nom et email de l'acheteur requis" }, 400);
  }
  if (!b.consent) return c.json({ error: "Le consentement à la collecte des données est requis" }, 400);

  const event = await c.env.DB.prepare(
    "SELECT id, title, public_slug, organizer_id FROM events WHERE public_slug = ? AND status = 'published'",
  )
    .bind(b.slug ?? "")
    .first<{ id: string; title: string; public_slug: string; organizer_id: string }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);

  // Réservation atomique via le Durable Object de l'événement
  let reservation: { transaction_id: string; amount_cents: number; currency: string };
  try {
    reservation = await callEventDO(c.env, event.id, {
      action: "reserve",
      event_id: event.id,
      category_id: String(b.category_id ?? ""),
      seller_code: b.seller_code || undefined,
      quantity: Number(b.quantity ?? 1) | 0,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      consent: true,
    });
  } catch (e) {
    if (e instanceof DOError) return c.json({ error: e.message }, 409);
    throw e;
  }

  // Paiement Stripe si configuré et montant > 0 ; sinon émission directe
  if (c.env.STRIPE_SECRET_KEY && reservation.amount_cents > 0) {
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    const quantity = Number(b.quantity ?? 1) | 0;
    const [cat, destination] = await Promise.all([
      c.env.DB.prepare("SELECT name FROM ticket_categories WHERE id = ?")
        .bind(b.category_id)
        .first<{ name: string }>(),
      organizerDestination(c.env, event.organizer_id),
    ]);
    // Organisateur activé sur Connect : destination charge — il reçoit 100 % du
    // prix affiché, l'acheteur paie des frais de service qui restent à la plateforme.
    const fee = destination ? await serviceFeeCents(c.env, reservation.amount_cents, quantity) : 0;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [
        {
          quantity,
          price_data: {
            currency: reservation.currency.toLowerCase(),
            unit_amount: reservation.amount_cents / quantity,
            product_data: { name: `${event.title} — ${cat?.name ?? "Billet"}` },
          },
        },
        ...(fee > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: reservation.currency.toLowerCase(),
                  unit_amount: fee,
                  product_data: { name: "Frais de service EventGalo" },
                },
              },
            ]
          : []),
      ],
      ...(destination
        ? {
            payment_intent_data: {
              application_fee_amount: fee,
              transfer_data: { destination },
            },
          }
        : {}),
      metadata: { transaction_id: reservation.transaction_id, event_id: event.id },
      success_url: `${c.env.WEB_BASE_URL}/checkout/success?tx=${reservation.transaction_id}`,
      cancel_url: `${c.env.WEB_BASE_URL}/e/${event.public_slug}?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    await c.env.DB.prepare(
      "UPDATE transactions SET stripe_session_id = ?, service_fee_cents = ?, stripe_destination_account = ? WHERE id = ?",
    )
      .bind(session.id, fee, destination, reservation.transaction_id)
      .run();
    return c.json({ mode: "stripe", checkout_url: session.url });
  }

  // Pas de Stripe configuré ou billet gratuit : émission immédiate
  const result = await callEventDO<{ tickets: Array<{ id: string; serial: string }> }>(c.env, event.id, {
    action: "finalize",
    transaction_id: reservation.transaction_id,
  });
  c.executionCtx.waitUntil(sendTicketsEmail(c.env, buyerEmail, buyerName, event.id, event.title, result.tickets));
  return c.json({
    mode: "direct",
    transaction_id: reservation.transaction_id,
    tickets: result.tickets.map((t) => ({ serial: t.serial, url: `${c.env.WEB_BASE_URL}/t/${t.serial}` })),
  });
});

/* ------------------------------ Liste d'attente ---------------------------- */

pub.post("/waitlist", async (c) => {
  // 10 requêtes / min par IP : dissuade le spam sur ce formulaire public.
  if (await isRateLimited(c.env, "waitlist", clientIp(c), 10, 60)) return tooManyRequests(c);
  const b = await c.req
    .json<{ category_id?: string; name?: string; email?: string; phone?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "Nom et email requis" }, 400);
  }
  const cat = await c.env.DB.prepare(
    `SELECT c.id, c.event_id, c.quantity, c.sold FROM ticket_categories c
     JOIN events e ON e.id = c.event_id WHERE c.id = ? AND e.status = 'published'`,
  )
    .bind(String(b.category_id ?? ""))
    .first<{ id: string; event_id: string; quantity: number; sold: number }>();
  if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
  if (cat.quantity - cat.sold > 0) return c.json({ error: "Cette catégorie n'est pas épuisée" }, 409);

  await c.env.DB.prepare(
    "INSERT INTO waitlist (id, event_id, category_id, name, email, phone) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(uuid(), cat.event_id, cat.id, name, email, (b.phone as string) || null)
    .run();
  return c.json({ ok: true }, 201);
});

export async function sendTicketsEmail(
  env: AppContext["Bindings"],
  email: string,
  name: string,
  eventId: string,
  eventTitle: string,
  tickets: Array<{ serial: string }>,
) {
  const links = tickets
    .map((t) => `<p><a href="${env.WEB_BASE_URL}/t/${t.serial}">Billet ${t.serial}</a></p>`)
    .join("");
  const logoUrl = await eventLogoUrl(env, eventId);
  await sendEmail(
    env,
    email,
    `Vos billets — ${eventTitle}`,
    layout(
      `Merci ${name} !`,
      `<p>Voici vos billets pour <strong>${eventTitle}</strong>. Présentez le QR code à l'entrée.</p>${links}`,
      { logoUrl, eventTitle },
    ),
    tickets[0] ? `${env.WEB_BASE_URL}/t/${tickets[0].serial}` : undefined,
  );
  await triggerWebhooks(env, eventId, "ticket.sold", {
    buyer_name: name,
    buyer_email: email,
    quantity: tickets.length,
    tickets: tickets.map((t) => ({ serial: t.serial })),
  });
}

/* ------------------------------ Transaction ------------------------------- */

pub.get("/transactions/:id", async (c) => {
  const tx = await c.env.DB.prepare(
    `SELECT tr.id, tr.status, tr.quantity, tr.amount_cents, tr.currency,
            e.title AS event_title, e.public_slug
     FROM transactions tr JOIN events e ON e.id = tr.event_id
     WHERE tr.id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; status: string; [k: string]: unknown }>();
  if (!tx) return c.json({ error: "Transaction introuvable" }, 404);
  let tickets: Array<{ serial: string; url: string }> = [];
  if (tx.status === "paid") {
    const rows = await c.env.DB.prepare(
      "SELECT serial FROM tickets WHERE transaction_id = ? ORDER BY created_at",
    )
      .bind(tx.id)
      .all<{ serial: string }>();
    tickets = rows.results.map((t) => ({ serial: t.serial, url: `${c.env.WEB_BASE_URL}/t/${t.serial}` }));
  }
  return c.json({ transaction: tx, tickets });
});

/* ------------------------------ Billet + QR ------------------------------- */

pub.get("/tickets/:serial", async (c) => {
  const ticket = await c.env.DB.prepare(
    `SELECT t.*, tc.name AS category_name, tc.perks AS category_perks, tc.price_cents, tc.currency,
            e.title AS event_title, e.starts_at, e.ends_at, e.venue, e.address, e.dress_code, e.public_slug, e.refund_policy, e.logo_media_id
     FROM tickets t
     JOIN ticket_categories tc ON tc.id = t.category_id
     JOIN events e ON e.id = t.event_id
     WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{ id: string; [k: string]: unknown }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  const qr_payload = await buildTicketPayload(c.env.TICKET_SIGNING_KEY, ticket.id);
  const { id: _id, ...safe } = ticket;
  return c.json({ ticket: safe, qr_payload });
});

pub.get("/tickets/:serial/ics", async (c) => {
  const ticket = await c.env.DB.prepare(
    `SELECT e.id AS event_id, e.title, e.description, e.starts_at, e.ends_at, e.venue, e.address, e.public_slug
     FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{
      event_id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
      venue: string | null; address: string | null; public_slug: string;
    }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  const ics = buildIcsEvent({
    uid: ticket.event_id,
    title: ticket.title,
    description: ticket.description,
    location: [ticket.venue, ticket.address].filter(Boolean).join(", ") || null,
    startsAt: ticket.starts_at,
    endsAt: ticket.ends_at,
    url: `https://eventgalo.com/e/${ticket.public_slug}`,
  });
  return icsResponse(ics, ticket.public_slug);
});

function parseRefundPolicy(raw: unknown): { kind?: string; days_before?: number; percent?: number } | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

pub.post("/tickets/:serial/refund-request", async (c) => {
  const b = await c.req.json<{ reason?: string; email?: string }>().catch(() => ({}) as Record<string, never>);
  const ticket = await c.env.DB.prepare(
    `SELECT t.id, t.transaction_id, t.buyer_email, t.status, t.serial, e.id AS event_id, e.starts_at, e.refund_policy
     FROM tickets t JOIN events e ON e.id = t.event_id
     WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{
      id: string; transaction_id: string; buyer_email: string; status: string; serial: string;
      event_id: string; starts_at: string; refund_policy: string | null;
    }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  if (ticket.status !== "valid") return c.json({ error: "Ce billet n'est plus remboursable" }, 409);
  if ((b.email ?? "").trim().toLowerCase() !== ticket.buyer_email) {
    return c.json({ error: "L'email ne correspond pas à l'acheteur du billet" }, 403);
  }
  const policy = parseRefundPolicy(ticket.refund_policy);
  if (policy?.kind === "none") {
    return c.json({ error: "Cet événement n'accepte pas les remboursements" }, 409);
  }
  const daysBefore = Number(policy?.days_before ?? 0);
  if (policy && daysBefore > 0) {
    const deadline = new Date(ticket.starts_at).getTime() - daysBefore * 86_400_000;
    if (Date.now() > deadline) {
      return c.json(
        { error: `Le délai de remboursement est dépassé (${daysBefore} jour${daysBefore > 1 ? "s" : ""} avant l'événement)` },
        409,
      );
    }
  }
  const existing = await c.env.DB.prepare(
    "SELECT id FROM refund_requests WHERE ticket_id = ? AND status = 'pending'",
  ).bind(ticket.id).first();
  if (existing) return c.json({ error: "Une demande est déjà en cours pour ce billet" }, 409);
  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO refund_requests (id, ticket_id, transaction_id, reason) VALUES (?, ?, ?, ?)",
  )
    .bind(id, ticket.id, ticket.transaction_id, b.reason ?? null)
    .run();
  c.executionCtx.waitUntil(
    triggerWebhooks(c.env, ticket.event_id, "refund.requested", {
      ticket_serial: ticket.serial,
      reason: b.reason ?? null,
    }),
  );
  return c.json({ ok: true, id }, 201);
});

pub.patch("/tickets/:serial/transfer", async (c) => {
  // 10 requêtes / min par IP : dissuade les tentatives de deviner l'email de l'acheteur.
  if (await isRateLimited(c.env, "ticket-transfer", clientIp(c), 10, 60)) return tooManyRequests(c);
  const b = await c.req
    .json<{ email?: string; new_name?: string; new_email?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const newName = String(b.new_name ?? "").trim();
  const newEmail = String(b.new_email ?? "").trim().toLowerCase();
  if (!newName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return c.json({ error: "Nom et email du nouveau titulaire requis" }, 400);
  }

  const ticket = await c.env.DB.prepare(
    `SELECT t.id, t.buyer_name, t.buyer_email, t.status, e.title AS event_title, e.public_slug, e.id AS event_id
     FROM tickets t JOIN events e ON e.id = t.event_id
     WHERE t.serial = ?`,
  )
    .bind(c.req.param("serial").toUpperCase())
    .first<{ id: string; buyer_name: string; buyer_email: string; status: string; event_title: string; public_slug: string; event_id: string }>();
  if (!ticket) return c.json({ error: "Billet introuvable" }, 404);
  if (ticket.status !== "valid") return c.json({ error: "Ce billet ne peut plus être transféré" }, 409);
  if ((b.email ?? "").trim().toLowerCase() !== ticket.buyer_email) {
    return c.json({ error: "L'email ne correspond pas à l'acheteur du billet" }, 403);
  }
  if (newEmail === ticket.buyer_email) {
    return c.json({ error: "Ce billet vous appartient déjà" }, 400);
  }

  await c.env.DB.prepare("UPDATE tickets SET buyer_name = ?, buyer_email = ? WHERE id = ?")
    .bind(newName, newEmail, ticket.id)
    .run();

  const url = `${c.env.WEB_BASE_URL}/t/${c.req.param("serial").toUpperCase()}`;
  c.executionCtx.waitUntil(
    (async () => {
      const brand = { logoUrl: await eventLogoUrl(c.env, ticket.event_id), eventTitle: ticket.event_title };
      await Promise.all([
        sendEmail(
          c.env,
          newEmail,
          `Un billet vous a été transféré — ${ticket.event_title}`,
          layout(
            `${ticket.buyer_name} vous a transféré un billet !`,
            `<p>Vous êtes maintenant titulaire d'un billet pour <strong>${ticket.event_title}</strong>.</p>
             <p><a href="${url}">Voir mon billet</a></p>`,
            brand,
          ),
          url,
        ),
        sendEmail(
          c.env,
          ticket.buyer_email,
          `Transfert confirmé — ${ticket.event_title}`,
          layout(
            "Transfert confirmé",
            `<p>Votre billet pour <strong>${ticket.event_title}</strong> a bien été transféré à ${newName} (${newEmail}).</p>`,
            brand,
          ),
        ),
      ]);
    })(),
  );
  return c.json({ ok: true });
});

/* ---------------------------------- Scan ---------------------------------- */

pub.post("/scan", async (c) => {
  const b = await c.req.json<{ scanner_key?: string; payload?: string }>().catch(() => ({}) as Record<string, never>);
  if (!b.scanner_key || !b.payload) return c.json({ error: "scanner_key et payload requis" }, 400);

  const event = await c.env.DB.prepare("SELECT id FROM events WHERE scanner_key = ?")
    .bind(b.scanner_key)
    .first<{ id: string }>();
  if (!event) return c.json({ ok: false, status: "invalid_signature", message: "Clé de scan invalide" }, 403);

  const ticketId = await verifyTicketPayload(c.env.TICKET_SIGNING_KEY, b.payload);
  if (!ticketId) {
    return c.json({ ok: false, status: "invalid_signature", message: "QR code falsifié ou illisible" });
  }
  const result = await callEventDO(c.env, event.id, {
    action: "scan",
    ticket_id: ticketId,
    event_id: event.id,
  });
  return c.json(result);
});

export default pub;
