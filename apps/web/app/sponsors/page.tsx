import type { Metadata } from "next";
import { BadgeCheck, Globe, MapPin, Search, Store } from "lucide-react";
import { COMPANY_SECTORS, parseSocials, type SocialKey } from "@/lib/sponsor";
import { SOCIAL_ICON_COMPONENTS } from "@/components/social-icons";
import { ProposeSponsorship } from "@/components/propose-sponsorship";
import { Stars } from "@/components/star-rating";

/** Note affichée seulement à partir de 3 avis : une note isolée est trop bruitée. */
const MIN_REVIEWS_SHOWN = 3;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export const metadata: Metadata = {
  title: "Annuaire des sponsors",
  description:
    "Découvrez les entreprises prêtes à sponsoriser des événements : galas, soirées communautaires, anniversaires. Entreprises : inscrivez-vous gratuitement.",
};

interface DirectoryCompany {
  id: string;
  name: string;
  kind: "company" | "professional";
  title: string | null;
  affiliation: string | null;
  sector: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  socials: string | null;
  has_logo: number;
  verified: number;
  sponsorships: number;
  avg_rating: number | null;
  review_count: number;
}

interface DirectoryFilters {
  q: string;
  sector: string;
  city: string;
  kind: string;
  verified: string;
}

async function getCompanies(f: DirectoryFilters): Promise<DirectoryCompany[]> {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.sector) params.set("sector", f.sector);
  if (f.city) params.set("city", f.city);
  if (f.kind) params.set("kind", f.kind);
  if (f.verified) params.set("verified", "1");
  const res = await fetch(`${API_BASE}/api/public/companies?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { companies: DirectoryCompany[] };
  return data.companies ?? [];
}

export default async function SponsorDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sector?: string; city?: string; kind?: string; verified?: string }>;
}) {
  const { q = "", sector = "", city = "", kind = "", verified = "" } = await searchParams;
  const companies = await getCompanies({ q, sector, city, kind, verified });

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
        <div className="grid2">
          <div>
            <label htmlFor="sector">Secteur</label>
            <select id="sector" name="sector" defaultValue={sector}>
              <option value="">Tous les secteurs</option>
              {COMPANY_SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kind">Type de profil</label>
            <select id="kind" name="kind" defaultValue={kind}>
              <option value="">Tous</option>
              <option value="company">Entreprises</option>
              <option value="professional">Professionnels indépendants</option>
            </select>
          </div>
        </div>
        <div className="check">
          <input id="verified" name="verified" type="checkbox" value="1" defaultChecked={verified === "1"} />
          <label htmlFor="verified" style={{ margin: 0, fontWeight: 400 }}>
            Profils vérifiés uniquement (domaine ou registre des entreprises)
          </label>
        </div>
        <button type="submit" className="btn-accent" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Search size={15} /> Rechercher
        </button>
      </form>

      {companies.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Aucune entreprise trouvée{q || sector || city || kind || verified ? " pour ces critères" : " pour le moment"}.
        </p>
      ) : (
        <div className="directory-grid">
          {companies.map((co) => {
            const socials = Object.entries(parseSocials(co.socials)) as Array<[SocialKey, string]>;
            const pro = co.kind === "professional";
            return (
              <div key={co.id} className="card directory-card">
                <a href={`/sponsors/${co.id}`} className="directory-card-head" style={{ textDecoration: "none", color: "inherit" }}>
                  {co.has_logo ? (
                    <img
                      src={`${API_BASE}/api/public/companies/${co.id}/logo`}
                      alt={co.name}
                      loading="lazy"
                      className={pro ? "pro-photo" : undefined}
                    />
                  ) : (
                    <span className="sponsor-name-fallback">{co.name.charAt(0).toUpperCase()}</span>
                  )}
                  <div>
                    <h3>
                      {co.name}
                      {Boolean(co.verified) && (
                        <span
                          className="badge ok"
                          style={{ marginLeft: 8, fontSize: 11, verticalAlign: "middle" }}
                          title={pro ? "Professionnel vérifié (affiliation ou registre)" : "Entreprise vérifiée (domaine ou registre des entreprises)"}
                        >
                          <BadgeCheck size={11} /> {pro ? "Pro vérifié" : "Vérifiée"}
                        </span>
                      )}
                    </h3>
                    <p className="muted directory-meta">
                      {pro && co.title && <span>{co.title}</span>}
                      {pro && co.affiliation && <span>{co.affiliation}</span>}
                      {!pro && co.sector && <span>{co.sector}</span>}
                      {co.city && (
                        <span>
                          <MapPin size={12} /> {co.city}
                        </span>
                      )}
                    </p>
                  </div>
                </a>
                {(co.sponsorships > 0 || (co.avg_rating != null && co.review_count >= MIN_REVIEWS_SHOWN)) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {co.sponsorships > 0 && (
                      <span className="badge ok directory-badge">
                        <BadgeCheck size={12} /> {co.sponsorships} événement{co.sponsorships > 1 ? "s" : ""} sponsorisé{co.sponsorships > 1 ? "s" : ""}
                      </span>
                    )}
                    {co.avg_rating != null && co.review_count >= MIN_REVIEWS_SHOWN && (
                      <Stars value={co.avg_rating} count={co.review_count} />
                    )}
                  </div>
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
                <ProposeSponsorship companyId={co.id} companyName={co.name} />
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
