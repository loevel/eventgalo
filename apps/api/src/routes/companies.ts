import { Hono } from "hono";
import type { AppContext } from "../types";
import { nowIso, randomToken, uuid } from "../lib/crypto";
import { requireAuth } from "../lib/auth";
import { eventLogoUrl, layout, sendEmail } from "../lib/email";
import { createNotification } from "../lib/notifications";
import { validateMediaFile } from "../lib/media";
import { clampText, sanitizeSocials, sanitizeVideoUrl } from "../lib/profile";
import { isRateLimited, tooManyRequests } from "../lib/rate-limit";
import {
  companyNamesMatch, domainOfEmail, domainOfUrl, findRegistryRecord,
  isFreeMailDomain, searchBusinessRegistry,
} from "../lib/verification";

/* ---------------------- Espace entreprise (authentifié) -------------------- */

const company = new Hono<AppContext>();
company.use("*", requireAuth);

/** Profil entreprise du compte connecté (null si pas encore créé). */
company.get("/", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first();
  return c.json({ company: row ?? null });
});

/** Crée ou met à jour le profil entreprise du compte connecté. */
company.put("/", async (c) => {
  const user = c.get("user");
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!name) return c.json({ error: "Nom de l'entreprise requis" }, 400);
  const kind = b.kind === "professional" ? "professional" : "company";
  const videoUrl = sanitizeVideoUrl(b.video_url);
  if (b.video_url && typeof b.video_url === "string" && b.video_url.trim() && !videoUrl) {
    return c.json({ error: "Vidéo : seuls les liens YouTube et Vimeo sont acceptés" }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT id, kind, verified_domain FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string; kind: string; verified_domain: string | null }>();
  const values = [
    name,
    kind,
    clampText(b.title, 120),
    clampText(b.affiliation, 120),
    clampText(b.sector, 80),
    clampText(b.city, 80),
    clampText(b.description, 1200),
    clampText(b.website, 300),
    clampText(b.phone, 40),
    clampText(b.public_email, 120),
    sanitizeSocials(b.socials),
    videoUrl,
    b.listed ? 1 : 0,
    b.vendor_listed ? 1 : 0,
    nowIso(),
  ];
  if (existing) {
    // Pour une entreprise, le badge « domaine vérifié » est lié au domaine du site : s'il
    // change, la vérification tombe. Un pro vérifié par email d'affiliation n'est pas concerné.
    // Changer de type remet aussi la vérification à zéro (sa signification change).
    const keepDomainVerif =
      kind === existing.kind &&
      (kind === "professional" ||
        !existing.verified_domain ||
        domainOfUrl(clampText(b.website, 300)) === existing.verified_domain);
    await c.env.DB.prepare(
      `UPDATE companies SET name = ?, kind = ?, title = ?, affiliation = ?, sector = ?, city = ?,
         description = ?, website = ?, phone = ?, public_email = ?, socials = ?, video_url = ?, listed = ?,
         vendor_listed = ?, updated_at = ?,
         verified_at = CASE WHEN ? THEN verified_at END,
         verified_domain = CASE WHEN ? THEN verified_domain END
       WHERE id = ?`,
    )
      .bind(...values, keepDomainVerif ? 1 : 0, keepDomainVerif ? 1 : 0, existing.id)
      .run();
    return c.json({ id: existing.id });
  }
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO companies (id, owner_user_id, name, kind, title, affiliation, sector, city,
       description, website, phone, public_email, socials, video_url, listed, vendor_listed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, ...values)
    .run();
  return c.json({ id }, 201);
});

/** Logo de l'entreprise (R2, hors table media car sans événement). */
company.post("/logo", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT id, logo_key FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string; logo_key: string | null }>();
  if (!row) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Fichier manquant" }, 400);
  const invalid = validateMediaFile(file);
  if (invalid) return c.json({ error: invalid }, 400);
  const key = `companies/${row.id}/${uuid()}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  if (row.logo_key) await c.env.MEDIA.delete(row.logo_key);
  await c.env.DB.prepare("UPDATE companies SET logo_key = ?, logo_type = ?, updated_at = ? WHERE id = ?")
    .bind(key, file.type, nowIso(), row.id)
    .run();
  return c.json({ ok: true });
});

/**
 * Réclamer ses sponsorings passés : retrouve les sponsorings d'événements dont le
 * contact est l'email du compte, les rattache au profil, et propose les infos
 * les plus riches pour préremplir le profil.
 */
company.post("/import", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  if (!row) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);
  const sponsorships = await c.env.DB.prepare(
    `SELECT id, company_name, website, description, address, phone, public_email, socials
     FROM sponsors WHERE contact_email = ? ORDER BY committed_at DESC, created_at DESC`,
  )
    .bind(user.email)
    .all<{
      id: string; company_name: string | null; website: string | null; description: string | null;
      address: string | null; phone: string | null; public_email: string | null; socials: string | null;
    }>();
  if (!sponsorships.results.length) {
    return c.json({ imported: 0, prefill: null });
  }
  await c.env.DB.prepare("UPDATE sponsors SET company_id = ? WHERE contact_email = ?")
    .bind(row.id, user.email)
    .run();
  // Le sponsoring le plus récent avec une description sert de base au profil.
  const richest = sponsorships.results.find((s) => s.description) ?? sponsorships.results[0];
  return c.json({
    imported: sponsorships.results.length,
    prefill: {
      name: richest.company_name,
      description: richest.description,
      website: richest.website,
      phone: richest.phone,
      public_email: richest.public_email,
      city: richest.address,
      socials: richest.socials,
    },
  });
});

/** Demandes et sponsorings liés à mon entreprise (par rattachement ou par email). */
company.get("/requests", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT id FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.token, s.status, s.amount_cents, s.paid_at, s.invite_message, s.source, s.created_at,
            s.confirmed_at, s.proposed_cents, s.proposal_status,
            t.name AS tier_name, t.currency,
            e.title AS event_title, e.starts_at, e.ends_at, e.venue, e.public_slug,
            (SELECT rating FROM sponsor_reviews r WHERE r.sponsor_id = s.id AND r.rated_by = 'company') AS my_rating
     FROM sponsors s
     JOIN events e ON e.id = s.event_id
     LEFT JOIN sponsor_tiers t ON t.id = s.tier_id
     WHERE s.company_id = ? OR s.contact_email = ?
     ORDER BY s.created_at DESC LIMIT 100`,
  )
    .bind(co?.id ?? "-", user.email)
    .all();
  return c.json({ requests: rows.results });
});

/**
 * Candidature spontanée : l'entreprise se propose comme sponsor d'un événement.
 * Crée directement un engagement « en attente » (comme si elle avait suivi un
 * lien /sp et choisi ce palier) : l'organisateur confirme ou décline.
 */
company.post("/apply", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT * FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{
      id: string; name: string; website: string | null; description: string | null; city: string | null;
      phone: string | null; public_email: string | null; socials: string | null; video_url: string | null;
      logo_key: string | null; logo_type: string | null;
    }>();
  if (!co) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);

  const b = await c.req.json<{ event_id?: string; tier_id?: string; message?: string }>()
    .catch(() => ({}) as Record<string, never>);
  if (!b.event_id || !b.tier_id) return c.json({ error: "Événement et palier requis" }, 400);

  const event = await c.env.DB.prepare(
    `SELECT e.id, e.title, u.id AS organizer_id, u.email AS organizer_email
     FROM events e JOIN users u ON u.id = e.organizer_id
     WHERE e.id = ? AND e.status = 'published'`,
  )
    .bind(b.event_id)
    .first<{ id: string; title: string; organizer_id: string; organizer_email: string }>();
  if (!event) return c.json({ error: "Événement introuvable" }, 404);
  const tier = await c.env.DB.prepare("SELECT * FROM sponsor_tiers WHERE id = ? AND event_id = ?")
    .bind(b.tier_id, event.id)
    .first<{ id: string; name: string; price_cents: number; quantity: number }>();
  if (!tier) return c.json({ error: "Palier introuvable" }, 404);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM sponsors WHERE event_id = ? AND (company_id = ? OR contact_email = ?)
     AND status IN ('invited','pending','confirmed')`,
  )
    .bind(event.id, co.id, user.email)
    .first();
  if (existing) return c.json({ error: "Vous avez déjà une demande en cours pour cet événement" }, 409);

  const taken = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sponsors WHERE tier_id = ? AND status IN ('pending','confirmed')",
  )
    .bind(tier.id)
    .first<{ n: number }>();
  if ((taken?.n ?? 0) >= tier.quantity) return c.json({ error: "Ce palier est complet" }, 409);

  const sponsorId = uuid();
  const token = randomToken(16);
  const message = clampText(b.message, 800);

  // Le logo de l'entreprise est copié dans la galerie de l'événement pour la vitrine.
  let logoMediaId: string | null = null;
  if (co.logo_key) {
    const obj = await c.env.MEDIA.get(co.logo_key);
    if (obj) {
      logoMediaId = uuid();
      const key = `events/${event.id}/${logoMediaId}`;
      await c.env.MEDIA.put(key, obj.body, { httpMetadata: { contentType: co.logo_type ?? "image/png" } });
      await c.env.DB.prepare(
        "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, NULL, ?, ?)",
      )
        .bind(logoMediaId, event.id, key, co.logo_type ?? "image/png")
        .run();
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO sponsors (id, event_id, tier_id, company_id, company_name, website, contact_email,
       logo_media_id, description, address, phone, public_email, socials, video_url, message,
       amount_cents, status, token, source, committed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'directory', ?)`,
  )
    .bind(
      sponsorId, event.id, tier.id, co.id, co.name, co.website, user.email,
      logoMediaId, co.description, co.city, co.phone, co.public_email, co.socials, co.video_url, message,
      tier.price_cents, token, nowIso(),
    )
    .run();

  const amount = (tier.price_cents / 100).toFixed(2);
  c.executionCtx.waitUntil(
    (async () =>
      void (await sendEmail(
        c.env,
        event.organizer_email,
        `Une entreprise se propose comme sponsor — ${event.title}`,
        layout(
          `${co.name} veut sponsoriser ${event.title} !`,
          `<p><strong>${co.name}</strong> a découvert votre événement dans les opportunités de sponsoring
             EventGalo et s'engage sur le palier <strong>${tier.name}</strong> (${amount}&nbsp;$).</p>
           ${message ? `<p style="border-left:3px solid #f2c078;padding-left:12px;color:#555">« ${message} »</p>` : ""}
           <p>Confirmez ou déclinez depuis l'onglet Sponsors de votre tableau de bord :</p>
           <p><a href="${c.env.WEB_BASE_URL}/dashboard/e/${event.id}">Ouvrir le tableau de bord</a></p>`,
          { logoUrl: await eventLogoUrl(c.env, event.id), eventTitle: event.title },
        ),
      )))(),
  );
  c.executionCtx.waitUntil(
    createNotification(c.env, event.organizer_id, {
      type: "sponsor_apply",
      title: `${co.name} veut sponsoriser ${event.title}`,
      body: `Palier ${tier.name} (${amount} $)`,
      link: `/dashboard/e/${event.id}`,
    }),
  );
  return c.json({ ok: true, token, status: "pending" }, 201);
});

/* ------------------------- Vérification d'entreprise ------------------------ */

/**
 * Étape 1 (email de domaine).
 * - Entreprise : l'adresse doit être au domaine du site web du profil — cliquer le
 *   lien prouve le contrôle du domaine. Un seul profil entreprise vérifié par domaine.
 * - Professionnel indépendant : l'adresse professionnelle (ex. email de bannière)
 *   prouve l'affiliation à ce domaine, sans exiger de site web.
 */
company.post("/verify/request", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT id, name, kind, website FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string; name: string; kind: string; website: string | null }>();
  if (!co) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);

  const b = await c.req.json<{ email?: string }>().catch(() => ({}) as Record<string, never>);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
  const emailDomain = domainOfEmail(email);
  if (!emailDomain) return c.json({ error: "Adresse email invalide" }, 400);
  if (isFreeMailDomain(emailDomain)) {
    return c.json({ error: "Utilisez une adresse professionnelle, pas un fournisseur grand public" }, 400);
  }

  let domain: string;
  if (co.kind === "professional") {
    domain = emailDomain;
  } else {
    const siteDomain = domainOfUrl(co.website);
    if (!siteDomain) {
      return c.json({ error: "Renseignez d'abord le site web de votre entreprise dans votre profil" }, 400);
    }
    if (emailDomain !== siteDomain) {
      return c.json({ error: `L'adresse doit être au domaine de votre site web (…@${siteDomain})` }, 400);
    }
    const taken = await c.env.DB.prepare(
      `SELECT id FROM companies WHERE kind = 'company' AND verified_domain = ?
       AND verified_at IS NOT NULL AND id != ?`,
    )
      .bind(siteDomain, co.id)
      .first();
    if (taken) {
      return c.json(
        {
          error: `Une entreprise vérifiée existe déjà pour le domaine ${siteDomain}. Si vous êtes un
            professionnel affilié (courtier, conseiller…), passez votre profil en « Professionnel
            indépendant » : votre vérification portera sur votre affiliation.`.replace(/\s+/g, " "),
        },
        409,
      );
    }
    domain = siteDomain;
  }
  if (await isRateLimited(c.env, "coverify", user.id, 3, 900)) return tooManyRequests(c);

  const token = randomToken(24);
  await c.env.KV.put(
    `coverify:${token}`,
    JSON.stringify({ company_id: co.id, domain }),
    { expirationTtl: 24 * 3600 },
  );
  const url = `${c.env.WEB_BASE_URL}/entreprise/verification/${token}`;
  const result = await sendEmail(
    c.env,
    email,
    "Vérifiez votre entreprise sur EventGalo",
    layout(
      `Vérification de ${co.name}`,
      `<p>Quelqu'un (sans doute vous) demande à faire vérifier le profil <strong>${co.name}</strong>
         sur EventGalo en prouvant ${co.kind === "professional"
           ? `son affiliation au domaine <strong>${domain}</strong>`
           : `le contrôle du domaine <strong>${domain}</strong>`}.</p>
       <p><a href="${url}">Confirmer la vérification</a></p>
       <p style="color:#777;font-size:13px">Ce lien expire dans 24&nbsp;heures. Si vous n'êtes pas à
         l'origine de cette demande, ignorez simplement ce message.</p>`,
    ),
    url,
  );
  return c.json({
    ok: true,
    domain,
    message: result.sent
      ? `Email envoyé à ${email} — cliquez le lien qu'il contient pour terminer la vérification.`
      : "Email non configuré : utilisez le lien ci-dessous (mode dev).",
    ...(result.sent ? {} : { debug_url: result.debug_url }),
  });
});

/**
 * Étape 2 (registre) : recherche dans les Registres d'entreprises du Canada
 * (API publique MRAS — fédéral + provinces, NEQ inclus) par nom ou numéro.
 */
company.get("/verify/registry/search", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return c.json({ records: [] });
  if (await isRateLimited(c.env, "coreg", user.id, 15, 60)) return tooManyRequests(c);
  try {
    return c.json({ records: await searchBusinessRegistry(q) });
  } catch {
    return c.json({ error: "Le registre des entreprises est indisponible, réessayez plus tard" }, 502);
  }
});

/**
 * Rattache le profil à l'inscription choisie, après revalidation côté serveur :
 * l'inscription doit être active et son nom légal concorder avec le nom du profil.
 */
company.post("/verify/registry", async (c) => {
  const user = c.get("user");
  const co = await c.env.DB.prepare("SELECT id, name FROM companies WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ id: string; name: string }>();
  if (!co) return c.json({ error: "Créez d'abord votre profil entreprise" }, 409);

  const b = await c.req.json<{ registry_id?: string; jurisdiction?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const registryId = String(b.registry_id ?? "").trim().slice(0, 40);
  const jurisdiction = String(b.jurisdiction ?? "").trim().slice(0, 10);
  if (!registryId || !jurisdiction) return c.json({ error: "Inscription au registre requise" }, 400);
  if (await isRateLimited(c.env, "coreg", user.id, 15, 60)) return tooManyRequests(c);

  let record;
  try {
    record = await findRegistryRecord(registryId, jurisdiction);
  } catch {
    return c.json({ error: "Le registre des entreprises est indisponible, réessayez plus tard" }, 502);
  }
  if (!record) return c.json({ error: "Inscription introuvable au registre" }, 404);
  if (record.status !== "Active") return c.json({ error: "Cette inscription n'est plus active au registre" }, 409);
  if (!companyNamesMatch(co.name, record.name)) {
    return c.json(
      {
        error: `Le nom de votre profil (« ${co.name} ») ne correspond pas au nom légal au registre
          (« ${record.name} »). Ajustez le nom de votre profil ou choisissez la bonne inscription.`.replace(/\s+/g, " "),
      },
      422,
    );
  }

  await c.env.DB.prepare(
    `UPDATE companies SET registry_id = ?, registry_jurisdiction = ?, registry_name = ?,
       registry_verified_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(record.registry_id, record.jurisdiction, record.name, nowIso(), nowIso(), co.id)
    .run();
  return c.json({ ok: true, record });
});

/* ----------------------------- Annuaire public ----------------------------- */

const directory = new Hono<AppContext>();

/**
 * Confirmation du lien de vérification par email de domaine. Public : le token
 * (usage unique, 24 h) est la preuve — le clic peut venir d'un autre navigateur
 * que celui où le compte est connecté.
 */
directory.post("/verify/confirm", async (c) => {
  const b = await c.req.json<{ token?: string }>().catch(() => ({}) as Record<string, never>);
  const token = String(b.token ?? "").slice(0, 100);
  if (!token) return c.json({ error: "Jeton manquant" }, 400);
  const raw = await c.env.KV.get(`coverify:${token}`);
  if (!raw) return c.json({ error: "Lien invalide ou expiré — redemandez un email de vérification" }, 400);
  await c.env.KV.delete(`coverify:${token}`);
  const { company_id, domain } = JSON.parse(raw) as { company_id: string; domain: string };
  await c.env.DB.prepare(
    "UPDATE companies SET verified_at = ?, verified_domain = ?, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), domain, nowIso(), company_id)
    .run();
  const co = await c.env.DB.prepare("SELECT name FROM companies WHERE id = ?")
    .bind(company_id)
    .first<{ name: string }>();
  return c.json({ ok: true, company_name: co?.name ?? "", domain });
});

directory.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const sector = (c.req.query("sector") ?? "").trim().slice(0, 80);
  const city = (c.req.query("city") ?? "").trim().slice(0, 80);
  const kind = (c.req.query("kind") ?? "").trim();
  const vendorMode = c.req.query("vendor") === "1";
  const conditions = [vendorMode ? "vendor_listed = 1" : "listed = 1"];
  const binds: unknown[] = [];
  if (q) {
    conditions.push("(name LIKE ? OR description LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (sector) {
    conditions.push("sector = ?");
    binds.push(sector);
  }
  if (city) {
    conditions.push("city LIKE ?");
    binds.push(`%${city}%`);
  }
  if (kind === "company" || kind === "professional") {
    conditions.push("kind = ?");
    binds.push(kind);
  }
  if (c.req.query("verified") === "1") {
    conditions.push("(verified_at IS NOT NULL OR registry_verified_at IS NOT NULL)");
  }
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.kind, c.title, c.affiliation, c.sector, c.city, c.description, c.website,
            c.socials, c.public_email, c.video_url,
            (c.logo_key IS NOT NULL) AS has_logo,
            (c.verified_at IS NOT NULL OR c.registry_verified_at IS NOT NULL) AS verified,
            (SELECT COUNT(*) FROM sponsors s WHERE s.company_id = c.id AND s.status = 'confirmed') AS sponsorships,
            (SELECT ROUND(AVG(r.rating), 1) FROM sponsor_reviews r JOIN sponsors s ON s.id = r.sponsor_id
             WHERE s.company_id = c.id AND r.rated_by = 'organizer') AS avg_rating,
            (SELECT COUNT(*) FROM sponsor_reviews r JOIN sponsors s ON s.id = r.sponsor_id
             WHERE s.company_id = c.id AND r.rated_by = 'organizer') AS review_count
     FROM companies c
     WHERE ${conditions.join(" AND ")}
     ORDER BY verified DESC, ${vendorMode ? "" : "sponsorships DESC, "}c.updated_at DESC LIMIT 60`,
  )
    .bind(...binds)
    .all();
  return c.json({ companies: rows.results });
});

/** Événements publiés à venir qui cherchent des sponsors (ont au moins un palier). */
directory.get("/opportunities", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const conditions = [
    "e.status = 'published'",
    "COALESCE(e.starts_at, '9999') > ?",
    "EXISTS (SELECT 1 FROM sponsor_tiers t WHERE t.event_id = e.id)",
  ];
  const binds: unknown[] = [nowIso()];
  if (q) {
    conditions.push("(e.title LIKE ? OR e.venue LIKE ? OR e.address LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const events = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.starts_at, e.venue, e.address, e.public_slug, e.logo_media_id, e.cover_media_id
     FROM events e WHERE ${conditions.join(" AND ")}
     ORDER BY e.starts_at ASC LIMIT 40`,
  )
    .bind(...binds)
    .all<{ id: string; [k: string]: unknown }>();
  const ids = events.results.map((e) => e.id);
  let tiers: Array<{ event_id: string; [k: string]: unknown }> = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await c.env.DB.prepare(
      `SELECT t.event_id, t.id, t.name, t.price_cents, t.currency, t.quantity, t.perks, t.showcase, t.rank,
              (SELECT COUNT(*) FROM sponsors s WHERE s.tier_id = t.id AND s.status IN ('pending','confirmed')) AS taken
       FROM sponsor_tiers t WHERE t.event_id IN (${placeholders}) ORDER BY t.rank, t.price_cents DESC`,
    )
      .bind(...ids)
      .all<{ event_id: string; [k: string]: unknown }>();
    tiers = rows.results;
  }
  return c.json({
    events: events.results.map((e) => ({ ...e, tiers: tiers.filter((t) => t.event_id === e.id) })),
  });
});

/** Ids + date de mise à jour des entreprises listées — utilisée par le sitemap. */
directory.get("/sitemap", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, updated_at FROM companies WHERE listed = 1 OR vendor_listed = 1 ORDER BY updated_at DESC LIMIT 5000",
  ).all();
  return c.json({ companies: rows.results });
});

/** Profil public d'une entreprise (page dédiée /sponsors/:id) — 404 si non listée. */
directory.get("/:id", async (c) => {
  const co = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.kind, c.title, c.affiliation, c.sector, c.city, c.description, c.website,
            c.socials, c.public_email, c.video_url, c.updated_at,
            (c.logo_key IS NOT NULL) AS has_logo,
            (c.verified_at IS NOT NULL OR c.registry_verified_at IS NOT NULL) AS verified,
            (SELECT COUNT(*) FROM sponsors s WHERE s.company_id = c.id AND s.status = 'confirmed') AS sponsorships,
            (SELECT ROUND(AVG(r.rating), 1) FROM sponsor_reviews r JOIN sponsors s ON s.id = r.sponsor_id
             WHERE s.company_id = c.id AND r.rated_by = 'organizer') AS avg_rating,
            (SELECT COUNT(*) FROM sponsor_reviews r JOIN sponsors s ON s.id = r.sponsor_id
             WHERE s.company_id = c.id AND r.rated_by = 'organizer') AS review_count
     FROM companies c WHERE c.id = ? AND (c.listed = 1 OR c.vendor_listed = 1)`,
  )
    .bind(c.req.param("id"))
    .first();
  if (!co) return c.json({ error: "Profil introuvable" }, 404);

  // Événements sponsorisés (confirmés, publiés) — maillage interne vers les pages événement.
  const events = await c.env.DB.prepare(
    `SELECT e.title, e.public_slug, e.starts_at, t.name AS tier_name
     FROM sponsors s
     JOIN events e ON e.id = s.event_id
     LEFT JOIN sponsor_tiers t ON t.id = s.tier_id
     WHERE s.company_id = ? AND s.status = 'confirmed' AND e.status = 'published'
     ORDER BY e.starts_at DESC LIMIT 20`,
  )
    .bind(c.req.param("id"))
    .all();

  return c.json({ company: co, events: events.results });
});

// Pas de condition `listed` : l'id UUID n'est pas devinable (même modèle que /media/:id/file),
// et le propriétaire doit voir son logo avant de publier son profil.
directory.get("/:id/logo", async (c) => {
  const row = await c.env.DB.prepare("SELECT logo_key, logo_type FROM companies WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ logo_key: string | null; logo_type: string | null }>();
  if (!row?.logo_key) return c.json({ error: "Logo introuvable" }, 404);
  const obj = await c.env.MEDIA.get(row.logo_key);
  if (!obj) return c.json({ error: "Logo introuvable" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.logo_type ?? "image/png",
      "Cache-Control": "public, max-age=3600",
      ETag: obj.httpEtag,
    },
  });
});

export { company as companyRoutes, directory as companyDirectoryRoutes };
