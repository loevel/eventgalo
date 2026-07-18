/** Réseaux sociaux autorisés dans les profils publics (sponsors, entreprises). */
export const SOCIAL_KEYS = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"] as const;

export function sanitizeSocials(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) {
      const url = v.trim().slice(0, 300);
      if (/^https?:\/\//i.test(url)) out[key] = url;
    }
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/** Tronque une valeur texte facultative. */
export function clampText(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Secteurs d'activité proposés dans l'annuaire (libres côté DB, guidés côté UI). */
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
