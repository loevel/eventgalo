import type { Env } from "../types";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface DraftContext {
  target: "description" | "announcement" | "sponsor_pitch";
  title: string;
  eventType: "private" | "ticketed";
  startsAt: string | null;
  venue: string | null;
  dressCode: string | null;
  hint?: string;
  companyName?: string;
  tierName?: string;
}

const SYSTEM_PROMPT = `Tu es un rédacteur qui aide des organisateurs d'événements (mariages, anniversaires, galas, conférences) au Canada francophone à écrire des textes chaleureux et professionnels en français. Réponds uniquement avec le texte demandé, sans titre, sans guillemets, sans markdown, sans préambule ni explication.`;

function buildUserPrompt(ctx: DraftContext): string {
  const date = ctx.startsAt
    ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(ctx.startsAt))
    : null;
  const facts = [
    `Titre : ${ctx.title}`,
    `Type : ${ctx.eventType === "ticketed" ? "événement avec billetterie" : "événement privé sur invitation"}`,
    date ? `Date : ${date}` : null,
    ctx.venue ? `Lieu : ${ctx.venue}` : null,
    ctx.dressCode ? `Dress code : ${ctx.dressCode}` : null,
  ].filter(Boolean).join("\n");

  if (ctx.target === "description") {
    return `Écris une description accueillante pour la page publique de cet événement (80 à 130 mots, ton chaleureux et professionnel, pas de markdown, pas d'emoji excessif) :\n${facts}${ctx.hint ? `\nPrécisions de l'organisateur : ${ctx.hint}` : ""}`;
  }
  if (ctx.target === "sponsor_pitch") {
    const target = ctx.companyName ? `l'entreprise ${ctx.companyName}` : "une entreprise partenaire potentielle";
    return `Écris un court message personnalisé (60 à 100 mots) envoyé par l'organisateur pour solliciter ${target} comme sponsor de cet événement${ctx.tierName ? ` (palier proposé : ${ctx.tierName})` : ""}. Ton professionnel et direct, met en avant la visibilité offerte au sponsor, se termine par une invitation à en discuter. Pas de formule d'appel ni de signature (le message s'insère dans un email déjà adressé).\nContexte de l'événement :\n${facts}${ctx.hint ? `\nPrécisions de l'organisateur sur pourquoi ce partenariat a du sens : ${ctx.hint}` : ""}`;
  }
  return `Écris une courte annonce (40 à 80 mots) envoyée par email aux invités de cet événement, à propos de : ${ctx.hint || "une information importante"}.\nContexte :\n${facts}`;
}

/** Génère un brouillon de texte (description ou annonce) via Workers AI. */
export async function generateDraft(env: Env, ctx: DraftContext): Promise<string> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(ctx) },
    ],
    max_tokens: 400,
  });
  const response = (result as { response?: unknown }).response;
  return typeof response === "string" ? response.trim() : "";
}

/* ----------------------- Suggestion de programme (IA) ---------------------- */

export interface AgendaSuggestionContext {
  title: string;
  eventType: "private" | "ticketed";
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
}

const AGENDA_SYSTEM_PROMPT = `Tu aides des organisateurs d'événements au Canada francophone à bâtir le déroulé de leur événement. Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour, sans markdown, de la forme [{"time":"19 h 00","label":"Accueil des invités"}, ...]. 5 à 8 étapes, "time" au format "H h MM" ou une plage courte, "label" court (5 mots max) et concret pour ce type d'événement précis.`;

function buildAgendaPrompt(ctx: AgendaSuggestionContext): string {
  const date = ctx.startsAt
    ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(ctx.startsAt))
    : null;
  const facts = [
    `Titre : ${ctx.title}`,
    `Type : ${ctx.eventType === "ticketed" ? "événement avec billetterie" : "événement privé sur invitation"}`,
    date ? `Début : ${date}` : null,
    ctx.venue ? `Lieu : ${ctx.venue}` : null,
  ].filter(Boolean).join("\n");
  return `Propose un déroulé/programme pour cet événement :\n${facts}`;
}

function normalizeAgendaItems(items: unknown[]): Array<{ time: string; label: string }> {
  return items
    .filter((item): item is { time: unknown; label: unknown } => typeof item === "object" && item !== null)
    .map((item) => ({ time: String((item as Record<string, unknown>).time ?? "").trim(), label: String((item as Record<string, unknown>).label ?? "").trim() }))
    .filter((item) => item.time && item.label)
    .slice(0, 10);
}

/** Certains modèles Workers AI détectent une demande de JSON et renvoient déjà `response` sous forme de tableau parsé plutôt qu'une chaîne — on gère les deux formes. */
function parseAgendaResponse(raw: unknown): Array<{ time: string; label: string }> {
  if (Array.isArray(raw)) return normalizeAgendaItems(raw);
  if (typeof raw !== "string") return [];
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? normalizeAgendaItems(parsed) : [];
  } catch {
    return [];
  }
}

/** Suggère un programme (liste d'étapes horodatées) pour un événement via Workers AI. Tableau vide si l'IA ne répond pas un JSON exploitable. */
export async function generateAgendaSuggestion(
  env: Env,
  ctx: AgendaSuggestionContext,
): Promise<Array<{ time: string; label: string }>> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: AGENDA_SYSTEM_PROMPT },
      { role: "user", content: buildAgendaPrompt(ctx) },
    ],
    max_tokens: 400,
  });
  return parseAgendaResponse((result as { response?: unknown }).response);
}

/* ------------------------- Résumé analytique (IA) ------------------------- */

export interface AnalyticsFacts {
  currency: string;
  invitesTotal: number;
  invitesOpened: number;
  rsvpYes: number;
  rsvpNo: number;
  rsvpPending: number;
  revenueCents: number;
  ticketsSold: number;
  ticketsUsed: number;
  monthly: Array<{ month: string; revenueCents: number; attendance: number }>;
  vendors: Array<{ name: string; quota: number; sold: number }>;
}

const ANALYTICS_SYSTEM_PROMPT = `Tu es un analyste qui aide des organisateurs d'événements au Canada francophone à comprendre leurs statistiques en un coup d'œil. Réponds en français, en 3 à 5 puces courtes commençant par "- ", ton direct et concret, sans jargon. N'invente aucun chiffre qui ne figure pas dans les données fournies. Mets en avant une tendance, un point d'attention, et une suggestion d'action concrète. Pas de titre, pas de préambule, pas de markdown élaboré.`;

function buildAnalyticsPrompt(facts: AnalyticsFacts): string {
  const money = (cents: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: facts.currency }).format(cents / 100);
  const lines = [
    `Invitations envoyées : ${facts.invitesTotal} (ouvertes : ${facts.invitesOpened})`,
    `RSVP : ${facts.rsvpYes} oui, ${facts.rsvpNo} non, ${facts.rsvpPending} en attente`,
    `Revenu total (billetterie + sponsoring) : ${money(facts.revenueCents)}`,
    `Billets : ${facts.ticketsSold} vendus, ${facts.ticketsUsed} scannés à l'entrée`,
  ];
  if (facts.monthly.some((m) => m.revenueCents > 0 || m.attendance > 0)) {
    lines.push(
      "Tendance mensuelle (revenu / présence) : " +
        facts.monthly.map((m) => `${m.month}: ${money(m.revenueCents)} / ${m.attendance}`).join(", "),
    );
  }
  if (facts.vendors.length > 0) {
    lines.push(
      "Top vendeurs (quota / vendu) : " +
        facts.vendors.slice(0, 5).map((v) => `${v.name}: ${v.sold}/${v.quota}`).join(", "),
    );
  }
  return `Voici les statistiques agrégées, tous événements confondus, d'un organisateur :\n${lines.join("\n")}\n\nRésume-les pour l'organisateur.`;
}

/** Génère un résumé en langage naturel des statistiques d'un organisateur via Workers AI. */
export async function generateAnalyticsSummary(env: Env, facts: AnalyticsFacts): Promise<string> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: ANALYTICS_SYSTEM_PROMPT },
      { role: "user", content: buildAnalyticsPrompt(facts) },
    ],
    max_tokens: 350,
  });
  const response = (result as { response?: unknown }).response;
  return typeof response === "string" ? response.trim() : "";
}

/* ---------------------- Résumé des avis d'un partenaire (IA) --------------- */

const REVIEW_SUMMARY_SYSTEM_PROMPT = `Tu résumes des avis laissés par des organisateurs d'événements à propos d'une entreprise partenaire (sponsor ou prestataire), pour un annuaire public au Canada francophone. Réponds en français, en 1 à 2 phrases neutres et factuelles, en te basant uniquement sur les avis fournis, sans inventer de détail, sans citer d'organisateur nommément. Pas de markdown, pas de préambule.`;

/** Résume en 1-2 phrases un ensemble de commentaires d'avis (≥3) laissés par des organisateurs, via Workers AI. */
export async function generateReviewSummary(env: Env, companyName: string, comments: string[]): Promise<string> {
  const list = comments.slice(0, 15).map((c, i) => `${i + 1}. ${c}`).join("\n");
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: REVIEW_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: `Avis reçus par « ${companyName} » :\n${list}` },
    ],
    max_tokens: 150,
  });
  const response = (result as { response?: unknown }).response;
  return typeof response === "string" ? response.trim() : "";
}

/* --------------------------- Assistant invités (IA) ------------------------ */

export interface EventQAContext {
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  address: string | null;
  dressCode: string | null;
  eventType: "private" | "ticketed";
  parkingAvailable: boolean;
  parkingDetails: string | null;
  accessibilityAvailable: boolean;
  accessibilityDetails: string | null;
  ageRestriction: string;
  ageRestrictionDetails: string | null;
  dayOfPhone: string | null;
  coatCheckAvailable: boolean;
  coatCheckDetails: string | null;
  agenda: Array<{ time: string; label: string }>;
  categories: Array<{ name: string; priceCents: number; currency: string }>;
}

/** Marqueur demandé au modèle pour signaler une information absente du contexte. */
const UNKNOWN_MARKER = "[INCONNU]";

const ASK_SYSTEM_PROMPT = `Tu es l'assistant virtuel d'un événement, destiné aux invités du public. Réponds UNIQUEMENT à partir des informations fournies ci-dessous à propos de cet événement précis. Si la question porte sur une information absente du contexte (ex. météo, détails non fournis), commence ta réponse par ${UNKNOWN_MARKER} puis dis clairement que tu ne sais pas et invite à contacter l'organisateur — n'invente jamais de détail. Si la question est hors-sujet (rien à voir avec cet événement), réponds poliment que tu ne peux répondre qu'aux questions sur cet événement. Réponds en français, en 1 à 3 phrases courtes, ton chaleureux, sans markdown.`;

/**
 * Formulations par lesquelles le modèle avoue son ignorance quand il oublie le
 * marqueur. Filet de rattrapage : un marqueur manqué ferait passer un trou de la
 * fiche pour une question réglée, et c'est justement ce qu'on cherche à voir.
 */
const UNKNOWN_PATTERNS =
  /je ne sais pas|je n'ai pas (?:cette |l')?info|n'est pas (?:précisé|indiqué|mentionné)|non précisé|contacter l'organisateur|contactez l'organisateur|ne figure pas/i;

function buildEventContext(ctx: EventQAContext): string {
  const date = ctx.startsAt
    ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(ctx.startsAt))
    : null;
  const endDate = ctx.endsAt
    ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(ctx.endsAt))
    : null;
  const lines = [
    `Titre : ${ctx.title}`,
    `Type : ${ctx.eventType === "ticketed" ? "événement avec billetterie" : "événement privé sur invitation"}`,
    date ? `Début : ${date}` : null,
    endDate ? `Fin : ${endDate}` : null,
    ctx.venue ? `Lieu : ${ctx.venue}` : null,
    ctx.address ? `Adresse : ${ctx.address}` : null,
    ctx.dressCode ? `Dress code : ${ctx.dressCode}` : null,
    `Stationnement : ${ctx.parkingAvailable ? ctx.parkingDetails || "disponible" : "non précisé"}`,
    `Accessibilité PMR : ${ctx.accessibilityAvailable ? ctx.accessibilityDetails || "disponible" : "non précisée"}`,
    ctx.ageRestriction !== "all" ? `Restriction d'âge : ${ctx.ageRestrictionDetails || ctx.ageRestriction}` : null,
    `Vestiaire : ${ctx.coatCheckAvailable ? ctx.coatCheckDetails || "disponible" : "non précisé"}`,
    ctx.dayOfPhone ? `Téléphone le jour J : ${ctx.dayOfPhone}` : null,
    ctx.description ? `Description : ${ctx.description}` : null,
  ].filter(Boolean);
  if (ctx.agenda.length > 0) {
    lines.push("Programme : " + ctx.agenda.map((a) => `${a.time} — ${a.label}`).join(" ; "));
  }
  if (ctx.categories.length > 0) {
    lines.push(
      "Catégories de billets : " +
        ctx.categories
          .map((c) => `${c.name} (${new Intl.NumberFormat("fr-CA", { style: "currency", currency: c.currency }).format(c.priceCents / 100)})`)
          .join(", "),
    );
  }
  return lines.join("\n");
}

export interface EventAnswer {
  answer: string;
  /** `false` quand l'information manquait à la fiche : c'est ce que l'organisateur doit voir. */
  answered: boolean;
}

/** Répond à une question d'invité sur un événement précis, à partir de son contexte public, via Workers AI. */
export async function generateEventAnswer(env: Env, ctx: EventQAContext, question: string): Promise<EventAnswer> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: ASK_SYSTEM_PROMPT },
      { role: "user", content: `Informations sur l'événement :\n${buildEventContext(ctx)}\n\nQuestion de l'invité : ${question}` },
    ],
    max_tokens: 250,
  });
  const response = (result as { response?: unknown }).response;
  const raw = typeof response === "string" ? response.trim() : "";

  const marked = raw.startsWith(UNKNOWN_MARKER);
  // Le marqueur est un détail d'implémentation : il ne doit jamais atteindre le visiteur.
  const answer = marked ? raw.slice(UNKNOWN_MARKER.length).trim() : raw;
  return { answer, answered: !marked && !UNKNOWN_PATTERNS.test(answer) };
}

/* ------------------ Utilitaire : réponses JSON structurées ---------------- */

/** Certains modèles renvoient déjà `response` sous forme d'objet/tableau parsé plutôt qu'une chaîne JSON — on gère les deux formes. */
function parseJsonResponse(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const match = raw.match(/[[{][\s\S]*[\]}]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/* --------------------- Détection de risque (annuaire, IA) ------------------ */

export interface FraudCheckContext {
  name: string;
  kind: "company" | "professional";
  title: string | null;
  affiliation: string | null;
  sector: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  publicEmail: string | null;
}

export interface FraudRiskAssessment {
  risk: "low" | "medium" | "high";
  reasons: string;
}

const FRAUD_SYSTEM_PROMPT = `Tu aides un modérateur humain d'un annuaire d'entreprises partenaires d'événements au Canada francophone à repérer les profils suspects avant validation. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme {"risk":"low","reasons":"..."} où risk vaut "low", "medium" ou "high". "risk" reflète la probabilité que ce profil soit un faux profil, un profil de test, du contenu générique/copié-collé ou incohérent (site web sans rapport avec le nom, description vide de sens, contact non professionnel, secteur incohérent avec la description). "reasons" est une phrase courte en français justifiant le verdict à partir des données fournies. Ne conclus "high" que si tu identifies un signal concret. En cas de doute ou de données insuffisantes pour juger, réponds "low". C'est une aide à la décision pour un humain, pas une accusation.`;

function buildFraudPrompt(ctx: FraudCheckContext): string {
  const lines = [
    `Nom : ${ctx.name}`,
    `Type de profil : ${ctx.kind === "professional" ? "professionnel indépendant" : "entreprise"}`,
    ctx.title ? `Titre / métier : ${ctx.title}` : null,
    ctx.affiliation ? `Affiliation : ${ctx.affiliation}` : null,
    ctx.sector ? `Secteur : ${ctx.sector}` : null,
    ctx.city ? `Ville : ${ctx.city}` : null,
    `Site web : ${ctx.website || "aucun"}`,
    `Email public : ${ctx.publicEmail || "aucun"}`,
    `Description : ${ctx.description || "aucune"}`,
  ].filter(Boolean).join("\n");
  return `Évalue ce profil avant validation dans l'annuaire :\n${lines}`;
}

function parseFraudResponse(raw: unknown): FraudRiskAssessment {
  const fallback: FraudRiskAssessment = { risk: "low", reasons: "Analyse indisponible — réessayez." };
  const obj = parseJsonResponse(raw);
  if (typeof obj !== "object" || obj === null) return fallback;
  const r = obj as Record<string, unknown>;
  const risk = r.risk === "medium" || r.risk === "high" ? r.risk : "low";
  const reasons = typeof r.reasons === "string" && r.reasons.trim() ? r.reasons.trim() : fallback.reasons;
  return { risk, reasons };
}

/** Évalue le risque qu'un profil de l'annuaire soit un faux profil ou du contenu suspect, via Workers AI — une aide à la modération, pas une décision automatique. */
export async function generateFraudRiskAssessment(env: Env, ctx: FraudCheckContext): Promise<FraudRiskAssessment> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: FRAUD_SYSTEM_PROMPT },
      { role: "user", content: buildFraudPrompt(ctx) },
    ],
    max_tokens: 200,
  });
  return parseFraudResponse((result as { response?: unknown }).response);
}

/* --------------------- Recherche en langage naturel (IA) ------------------- */

export interface DirectorySearchFilters {
  q: string;
  sector: string;
  city: string;
  kind: "" | "company" | "professional";
  verified: boolean;
}

const DIRECTORY_SEARCH_SYSTEM_PROMPT = `Tu convertis une recherche en langage naturel en filtres structurés pour un annuaire d'entreprises partenaires d'événements au Canada francophone. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme {"q":"...","sector":"...","city":"...","kind":"company"|"professional"|null,"verified":true|false}. "sector" doit être repris EXACTEMENT tel quel dans la liste fournie s'il correspond clairement, sinon "". "q" contient les mots-clés libres restants (nom, activité précise) une fois la ville, le secteur et le type extraits de la requête — "" si rien de pertinent ne reste. "kind" ne vaut "professional" que si l'utilisateur cherche explicitement un indépendant/pigiste, "company" que s'il exclut explicitement les indépendants, sinon null. "verified" vaut true seulement si l'utilisateur demande explicitement des profils vérifiés/certifiés. N'invente rien d'absent de la requête.`;

function parseDirectorySearchResponse(raw: unknown, sectors: string[]): DirectorySearchFilters {
  const fallback: DirectorySearchFilters = { q: "", sector: "", city: "", kind: "", verified: false };
  const obj = parseJsonResponse(raw);
  if (typeof obj !== "object" || obj === null) return fallback;
  const r = obj as Record<string, unknown>;
  const sector = typeof r.sector === "string" && sectors.includes(r.sector) ? r.sector : "";
  const kind = r.kind === "company" || r.kind === "professional" ? r.kind : "";
  return {
    q: typeof r.q === "string" ? r.q.trim().slice(0, 80) : "",
    sector,
    city: typeof r.city === "string" ? r.city.trim().slice(0, 80) : "",
    kind,
    verified: r.verified === true,
  };
}

/** Convertit une recherche libre ("entreprises vérifiées de Montréal en événementiel") en filtres structurés pour l'annuaire, via Workers AI. */
export async function parseDirectorySearch(env: Env, query: string, sectors: string[]): Promise<DirectorySearchFilters> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: DIRECTORY_SEARCH_SYSTEM_PROMPT },
      { role: "user", content: `Secteurs disponibles : ${sectors.join(", ")}\n\nRequête : ${query}` },
    ],
    max_tokens: 200,
  });
  return parseDirectorySearchResponse((result as { response?: unknown }).response, sectors);
}

export interface OpportunitySearchFilters {
  q: string;
  from: string;
  to: string;
}

const OPPORTUNITY_SEARCH_SYSTEM_PROMPT = `Tu convertis une recherche en langage naturel en filtres pour une liste d'événements publics qui recherchent des sponsors, au Canada francophone. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme {"q":"...","from":"AAAA-MM-JJ"|null,"to":"AAAA-MM-JJ"|null}. "q" contient les mots-clés libres restants (ville, nom, type d'événement) une fois la période extraite de la requête — "" si rien de pertinent ne reste. "from"/"to" ne sont renseignés QUE si l'utilisateur mentionne une période (ex. "en septembre", "cet été", "avant Noël", "ce mois-ci") ; résous-les par rapport à la date d'aujourd'hui fournie, en couvrant toute la période mentionnée (ex. le mois entier). Sinon null. N'invente rien d'absent de la requête.`;

function parseOpportunitySearchResponse(raw: unknown): OpportunitySearchFilters {
  const fallback: OpportunitySearchFilters = { q: "", from: "", to: "" };
  const obj = parseJsonResponse(raw);
  if (typeof obj !== "object" || obj === null) return fallback;
  const r = obj as Record<string, unknown>;
  const dateOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return {
    q: typeof r.q === "string" ? r.q.trim().slice(0, 80) : "",
    from: dateOk(r.from) ? r.from : "",
    to: dateOk(r.to) ? r.to : "",
  };
}

/** Convertit une recherche libre ("galas à Montréal en septembre") en mots-clés + période pour la liste d'opportunités de sponsoring, via Workers AI. */
export async function parseOpportunitySearch(env: Env, query: string): Promise<OpportunitySearchFilters> {
  const today = new Intl.DateTimeFormat("fr-CA", { dateStyle: "full" }).format(new Date());
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: OPPORTUNITY_SEARCH_SYSTEM_PROMPT },
      { role: "user", content: `Aujourd'hui : ${today} (${new Date().toISOString().slice(0, 10)})\n\nRequête : ${query}` },
    ],
    max_tokens: 200,
  });
  return parseOpportunitySearchResponse((result as { response?: unknown }).response);
}

/* ------------------------ Résumé de notifications (IA) --------------------- */

const NOTIFICATION_DIGEST_SYSTEM_PROMPT = `Tu résumes une liste de notifications d'un organisateur d'événements au Canada francophone en un court paragraphe. Réponds en français, 2 à 4 phrases, ton direct, en regroupant les notifications similaires plutôt qu'en les énumérant une à une. Pas de markdown, pas de préambule, base-toi uniquement sur les notifications fournies.`;

/** Résume une liste de notifications (titre + corps) en un court paragraphe via Workers AI. */
export async function generateNotificationDigest(
  env: Env,
  items: Array<{ title: string; body: string | null }>,
): Promise<string> {
  const list = items.slice(0, 30).map((n, i) => `${i + 1}. ${n.title}${n.body ? ` — ${n.body}` : ""}`).join("\n");
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: NOTIFICATION_DIGEST_SYSTEM_PROMPT },
      { role: "user", content: `Notifications récentes :\n${list}` },
    ],
    max_tokens: 250,
  });
  const response = (result as { response?: unknown }).response;
  return typeof response === "string" ? response.trim() : "";
}

/* -------------------- Fond de bandeau publicitaire (IA) -------------------- */

const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export type AdBackgroundStyle = "photo" | "abstrait" | "festif" | "epure";

/** Direction artistique de chaque style, en anglais : le modèle y répond mieux. */
const STYLE_PROMPTS: Record<AdBackgroundStyle, string> = {
  photo: "photorealistic editorial photograph, natural light, shallow depth of field, warm tones",
  abstrait: "abstract geometric background, smooth gradients, soft shapes, modern brand aesthetic",
  festif: "festive celebration atmosphere, warm bokeh lights, elegant evening mood, golden highlights",
  epure: "minimal clean background, generous negative space, soft neutral tones, subtle texture",
};

export interface AdBackgroundContext {
  companyName: string;
  sector: string | null;
  style: AdBackgroundStyle;
  /** Précision libre de l'annonceur (« traiteur africain », « salle de réception »…). */
  hint?: string;
}

/**
 * Génère **uniquement un fond** de bandeau publicitaire. Le texte (nom de
 * l'entreprise, accroche) est composé par-dessus côté navigateur, avec les
 * vraies polices : les modèles de diffusion écrivent le texte de façon peu
 * fiable et produiraient des mots inventés sur une créative payée.
 *
 * Renvoie l'image en base64 (JPEG), telle que fournie par le modèle.
 */
export async function generateAdBackground(env: Env, ctx: AdBackgroundContext): Promise<string> {
  const subject = [ctx.hint, ctx.sector, ctx.companyName]
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 300);

  const prompt = [
    `advertising banner background for a business: ${subject || "local business"}`,
    STYLE_PROMPTS[ctx.style] ?? STYLE_PROMPTS.photo,
    // La zone de gauche accueillera le texte composé côté navigateur.
    "wide horizontal composition, uncluttered on the left side",
    "no text, no letters, no words, no numbers, no logo, no watermark, no signage",
  ].join(", ");

  const result = await env.AI.run(IMAGE_MODEL, { prompt, steps: 6 });
  const image = (result as { image?: unknown }).image;
  if (typeof image !== "string" || !image) throw new Error("Image non générée");
  return image;
}

/* ------------------- Fond de dépliant d'événement (IA) -------------------- */

/**
 * Modèle retenu pour les dépliants : contrairement à FLUX-schnell, qui ne rend
 * que du 1024x1024, celui-ci accepte des dimensions arbitraires — indispensable
 * pour une affiche portrait ou une story, qu'un recadrage depuis un carré
 * amputerait de moitié.
 */
const POSTER_MODEL = "@cf/leonardo/lucid-origin";

/** Formats proposés, avec les dimensions demandées au modèle. */
export const FLYER_FORMATS = {
  affiche: { width: 1024, height: 1280 },
  story: { width: 864, height: 1536 },
  carre: { width: 1152, height: 1152 },
  a4: { width: 1024, height: 1448 },
  // Le kit de communication décline un *seul* fond sur des formats allant du
  // 9:16 au très large : le carré est la seule source qui se recadre
  // acceptablement dans les deux sens.
  kit: { width: 1280, height: 1280 },
} as const;

export type FlyerFormat = keyof typeof FLYER_FORMATS;
export type FlyerMood = "gala" | "festif" | "chaleureux" | "epure";

/** Direction artistique de chaque ambiance, en anglais : le modèle y répond mieux. */
const MOOD_PROMPTS: Record<FlyerMood, string> = {
  gala: "elegant black-tie gala atmosphere, deep warm tones, candlelight, refined and cinematic",
  festif: "joyful celebration, warm bokeh lights, dancing colours, energetic evening mood",
  chaleureux: "warm welcoming gathering, golden hour light, natural textures, intimate scale",
  epure: "minimal editorial composition, generous negative space, soft neutral tones, subtle texture",
};

export interface FlyerBackgroundContext {
  title: string;
  venue: string | null;
  /** Précision libre de l'organisateur (« mariage traditionnel », « concert jazz »…). */
  hint?: string;
  mood: FlyerMood;
  format: FlyerFormat;
}

/**
 * Génère **uniquement le fond** d'un dépliant. Le titre, la date, le lieu, le
 * prix et le code QR sont composés par-dessus côté navigateur : ce sont des
 * données exactes, qu'un modèle de diffusion réécrirait de travers.
 *
 * Renvoie l'image en base64, telle que fournie par le modèle.
 */
export async function generateFlyerBackground(env: Env, ctx: FlyerBackgroundContext): Promise<string> {
  const subject = [ctx.hint, ctx.venue]
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 300);

  const { width, height } = FLYER_FORMATS[ctx.format] ?? FLYER_FORMATS.affiche;

  const prompt = [
    `background artwork for an event poster${subject ? `: ${subject}` : ""}`,
    MOOD_PROMPTS[ctx.mood] ?? MOOD_PROMPTS.gala,
    // Le bas de l'affiche reçoit le bloc de texte composé côté navigateur.
    "vertical composition, the lower third calm and uncluttered",
    "no text, no letters, no words, no numbers, no logo, no watermark, no poster lettering",
  ].join(", ");

  const result = await env.AI.run(POSTER_MODEL, { prompt, width, height, steps: 20 });
  const image = (result as { image?: unknown }).image;
  if (typeof image !== "string" || !image) throw new Error("Image non générée");
  return image;
}
