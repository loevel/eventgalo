/**
 * Vérification d'entreprise.
 * - Email de domaine : prouver que l'entreprise contrôle le domaine de son site web.
 * - Registre : rattachement à une inscription active des Registres d'entreprises du
 *   Canada (API publique MRAS d'ISDE, fédéral + toutes les provinces, NEQ inclus).
 */

const MRAS_SEARCH_URL = "https://ised-isde.canada.ca/cbr/srch/api/v1/search";

/** Fournisseurs d'email grand public : ne prouvent pas le contrôle d'un domaine d'entreprise. */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr",
  "live.com", "live.ca", "live.fr", "msn.com", "yahoo.com", "yahoo.ca", "yahoo.fr", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
  "gmx.fr", "mail.com", "zoho.com", "videotron.ca", "bell.net", "sympatico.ca",
]);

/** Domaine « enregistrable » approximatif : hôte en minuscules sans « www. ». */
export function domainOfUrl(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const host = new URL(website.includes("://") ? website : `https://${website}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function domainOfEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().replace(/^www\./, "");
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain);
}

/* --------------------------- Concordance de noms --------------------------- */

/** Formes juridiques et mots vides, ignorés lors de la comparaison des noms. */
const NAME_NOISE = new Set([
  "inc", "incorporated", "incorporee", "ltee", "ltd", "limited", "limitee", "corp",
  "corporation", "cie", "co", "compagnie", "company", "enr", "senc", "sencrl", "llp",
  "sa", "llc", "plc", "ulc", "les", "le", "la", "l", "de", "du", "des", "d", "et",
  "and", "the", "of", "au", "aux", "a",
]);

function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !NAME_NOISE.has(t));
}

/**
 * Concordance tolérante entre le nom du profil et le nom légal au registre :
 * au moins un mot significatif en commun (« Boulangerie Chez Marie inc. » ↔
 * « 9123-4567 Québec inc. » ne passe pas ; « Chez Marie » ↔ « Boulangerie Chez
 * Marie inc. » passe).
 */
export function companyNamesMatch(profileName: string, registryName: string): boolean {
  const a = nameTokens(profileName);
  const b = new Set(nameTokens(registryName));
  if (!a.length || !b.size) return false;
  return a.some((t) => b.has(t));
}

/* ------------------------ Registres d'entreprises (MRAS) ------------------------ */

export interface RegistryRecord {
  registry_id: string;
  jurisdiction: string;
  name: string;
  status: string;
  city: string | null;
  entity_type: string | null;
  date_incorporated: string | null;
}

interface MrasDoc {
  Juri_ID?: string;
  Jurisdiction?: string;
  Company_Name?: string;
  Status_State?: string;
  City?: string;
  Reg_office_city?: string;
  Entity_Type?: string;
  Date_Incorporated?: string;
  hierarchy?: string;
}

/** Recherche dans les Registres d'entreprises du Canada (nom ou numéro). */
export async function searchBusinessRegistry(query: string, rows = 8): Promise<RegistryRecord[]> {
  const params = new URLSearchParams({
    fq: `keyword:{${query}} AND Status_State:Active`,
    lang: "fr",
    queryaction: "fieldquery",
    sortfield: "score",
    sortorder: "desc",
    rows: String(rows),
  });
  const res = await fetch(`${MRAS_SEARCH_URL}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Registre indisponible (HTTP ${res.status})`);
  const data = (await res.json()) as { docs?: MrasDoc[] };
  const seen = new Set<string>();
  const records: RegistryRecord[] = [];
  for (const d of data.docs ?? []) {
    if (!d.Juri_ID || !d.Jurisdiction || !d.Company_Name) continue;
    if (d.hierarchy && d.hierarchy !== "parent") continue; // ignore les établissements secondaires
    const key = `${d.Jurisdiction}:${d.Juri_ID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      registry_id: d.Juri_ID,
      jurisdiction: d.Jurisdiction,
      name: d.Company_Name,
      status: d.Status_State ?? "",
      city: d.City ?? d.Reg_office_city ?? null,
      entity_type: d.Entity_Type ?? null,
      date_incorporated: d.Date_Incorporated ?? null,
    });
  }
  return records;
}

/** Retrouve une inscription précise (revalidation côté serveur du choix de l'utilisateur). */
export async function findRegistryRecord(
  registryId: string,
  jurisdiction: string,
): Promise<RegistryRecord | null> {
  const records = await searchBusinessRegistry(registryId, 20);
  return (
    records.find((r) => r.registry_id === registryId && r.jurisdiction === jurisdiction) ?? null
  );
}
