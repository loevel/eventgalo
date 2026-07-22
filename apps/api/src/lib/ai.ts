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
  const text = (result as { response?: string }).response ?? "";
  return text.trim();
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
  const text = (result as { response?: string }).response ?? "";
  return text.trim();
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
  const text = (result as { response?: string }).response ?? "";
  return text.trim();
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

const ASK_SYSTEM_PROMPT = `Tu es l'assistant virtuel d'un événement, destiné aux invités du public. Réponds UNIQUEMENT à partir des informations fournies ci-dessous à propos de cet événement précis. Si la question porte sur une information absente du contexte (ex. météo, détails non fournis), dis clairement que tu ne sais pas et invite à contacter l'organisateur — n'invente jamais de détail. Si la question est hors-sujet (rien à voir avec cet événement), réponds poliment que tu ne peux répondre qu'aux questions sur cet événement. Réponds en français, en 1 à 3 phrases courtes, ton chaleureux, sans markdown.`;

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

/** Répond à une question d'invité sur un événement précis, à partir de son contexte public, via Workers AI. */
export async function generateEventAnswer(env: Env, ctx: EventQAContext, question: string): Promise<string> {
  const result = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: ASK_SYSTEM_PROMPT },
      { role: "user", content: `Informations sur l'événement :\n${buildEventContext(ctx)}\n\nQuestion de l'invité : ${question}` },
    ],
    max_tokens: 250,
  });
  const text = (result as { response?: string }).response ?? "";
  return text.trim();
}
