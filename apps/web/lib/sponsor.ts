/** Secteurs proposés dans l'annuaire des sponsors. */
export const COMPANY_SECTORS = [
  "Restauration & traiteur",
  "Finance & assurance",
  "Commerce de détail",
  "Technologie",
  "Santé & bien-être",
  "Immobilier & construction",
  "Médias & marketing",
  "Transport",
  "Éducation",
  "Boissons & vignobles",
  "Autre",
] as const;

/** Suggestions de rôle pour les artistes/intervenants — champ libre, pas une liste fermée. */
export const PERFORMER_ROLES = [
  "Musicien / DJ",
  "Groupe de musique",
  "Chanteur / Chanteuse",
  "Animateur / MC",
  "Humoriste",
  "Danseur / Danseuse",
  "Conférencier",
  "Imprésario",
] as const;

/** Clés de réseaux sociaux supportées dans le profil sponsor. */
export const SOCIAL_KEYS = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/** Désérialise la colonne `socials` (JSON objet) d'un sponsor. */
export function parseSocials(raw: unknown): Partial<Record<SocialKey, string>> {
  let obj: unknown = raw;
  if (typeof raw === "string" && raw) {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof obj !== "object" || obj === null) return {};
  const out: Partial<Record<SocialKey, string>> = {};
  for (const key of SOCIAL_KEYS) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string" && v) out[key] = v;
  }
  return out;
}

/** URL d'intégration (iframe) pour un lien YouTube/Vimeo, ou null si non reconnu. */
export function videoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = url.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);
      return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
    }
    if (host === "player.vimeo.com") return raw;
    if (host === "vimeo.com") {
      const m = url.pathname.match(/^\/(\d+)/);
      return m ? `https://player.vimeo.com/video/${m[1]}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
