import type { Metadata } from "next";
import { BadgeCheck, Globe, MapPin, Search, Store } from "lucide-react";
import { COMPANY_SECTORS, parseSocials, type SocialKey } from "@/lib/sponsor";
import { SOCIAL_ICON_COMPONENTS } from "@/components/social-icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export const metadata: Metadata = {
  title: "Annuaire des sponsors",
  description:
    "Découvrez les entreprises prêtes à sponsoriser des événements : galas, soirées communautaires, anniversaires. Entreprises : inscrivez-vous gratuitement.",
};

interface DirectoryCompany {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  socials: string | null;
  has_logo: number;
  sponsorships: number;
}

async function getCompanies(q: string, sector: string, city: string): Promise<DirectoryCompany[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sector) params.set("sector", sector);
  if (city) params.set("city", city);
  const res = await fetch(`${API_BASE}/api/public/companies?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { companies: DirectoryCompany[] };
  return data.companies ?? [];
}

export default async function SponsorDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sector?: string; city?: string }>;
}) {
  const { q = "", sector = "", city = "" } = await searchParams;
  const companies = await getCompanies(q, sector, city);

  return (
    <main className="container">
      <div className="directory-hero">
        <span className="section-kicker">Annuaire</span>
        <h1 className="section-title">Des sponsors pour vos événements</h1>
        <p className="section-sub">
          Ces entreprises soutiennent des événements comme les vôtres. Organisateurs : découvrez-les et
          invitez-les depuis l&apos;onglet Sponsors de votre événement.
        </p>
      </div>

      <form className="card directory-filters" method="GET">
        <div className="grid2">
          <div>
            <label htmlFor="q">Recherche</label>
            <input id="q" name="q" defaultValue={q} placeholder="Nom, mots-clés…" />
          </div>
          <div>
            <label htmlFor="city">Ville / région</label>
            <input id="city" name="city" defaultValue={city} placeholder="Montréal" />
          </div>
        </div>
        <label htmlFor="sector">Secteur</label>
        <select id="sector" name="sector" defaultValue={sector}>
          <option value="">Tous les secteurs</option>
          {COMPANY_SECTORS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="btn-accent" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Search size={15} /> Rechercher
        </button>
      </form>

      {companies.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Aucune entreprise trouvée{q || sector || city ? " pour ces critères" : " pour le moment"}.
        </p>
      ) : (
        <div className="directory-grid">
          {companies.map((co) => {
            const socials = Object.entries(parseSocials(co.socials)) as Array<[SocialKey, string]>;
            return (
              <div key={co.id} className="card directory-card">
                <div className="directory-card-head">
                  {co.has_logo ? (
                    <img src={`${API_BASE}/api/public/companies/${co.id}/logo`} alt={co.name} loading="lazy" />
                  ) : (
                    <span className="sponsor-name-fallback">{co.name.charAt(0).toUpperCase()}</span>
                  )}
                  <div>
                    <h3>{co.name}</h3>
                    <p className="muted directory-meta">
                      {co.sector && <span>{co.sector}</span>}
                      {co.city && (
                        <span>
                          <MapPin size={12} /> {co.city}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {co.sponsorships > 0 && (
                  <span className="badge ok directory-badge">
                    <BadgeCheck size={12} /> {co.sponsorships} événement{co.sponsorships > 1 ? "s" : ""} sponsorisé{co.sponsorships > 1 ? "s" : ""}
                  </span>
                )}
                {co.description && <p className="sponsor-desc clamp">{co.description}</p>}
                <div className="sponsor-links">
                  {co.website && (
                    <a href={co.website} target="_blank" rel="noopener noreferrer nofollow" aria-label="Site web" title="Site web">
                      <Globe />
                    </a>
                  )}
                  {socials.map(([key, url]) => {
                    const Icon = SOCIAL_ICON_COMPONENTS[key];
                    return (
                      <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={key} title={key}>
                        <Icon />
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card directory-cta">
        <Store size={26} style={{ color: "var(--accent)" }} />
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Vous êtes une entreprise ?</h3>
          <p className="muted" style={{ margin: 0 }}>
            Inscrivez-vous gratuitement dans l&apos;annuaire : les associations qui organisent des galas et
            événements pourront vous découvrir et vous proposer des sponsorings.
          </p>
        </div>
        <a className="btn btn-accent" href="/entreprise" style={{ marginTop: 0, whiteSpace: "nowrap" }}>
          Créer mon profil
        </a>
      </div>
    </main>
  );
}
