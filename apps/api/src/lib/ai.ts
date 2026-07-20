import type { Env } from "../types";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface DraftContext {
  target: "description" | "announcement";
  title: string;
  eventType: "private" | "ticketed";
  startsAt: string | null;
  venue: string | null;
  dressCode: string | null;
  hint?: string;
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
