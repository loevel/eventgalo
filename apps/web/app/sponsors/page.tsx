import type { Metadata } from "next";
import { BadgeCheck, Globe, MapPin, PlayCircle, Store } from "lucide-react";
import { COMPANY_SECTORS, MIN_REVIEWS_SHOWN, parseSocials, type SocialKey } from "@/lib/sponsor";
import { SOCIAL_ICON_COMPONENTS } from "@/components/social-icons";
import { ProposeSponsorship } from "@/components/propose-sponsorship";
import { Stars } from "@/components/star-rating";
import { DirectoryFilters } from "@/components/directory-filters";
import { SmartSearch } from "@/components/smart-search";
import { Pagination } from "@/components/pagination";

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
  video_url: string | null;
}

interface SponsorFilters {
  q: string;
  sector: string;
  city: string;
  kind: string;
  verified: string;
  page: number;
}

interface CompaniesResponse {
  companies: DirectoryCompany[];
  total: number;
  page: number;
  pageSize: number;
}

async function getCompanies(f: SponsorFilters): Promise<CompaniesResponse> {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.sector) params.set("sector", f.sector);
  if (f.city) params.set("city", f.city);
  if (f.kind) params.set("kind", f.kind);
  if (f.verified) params.set("verified", "1");
  if (f.page > 1) params.set("page", String(f.page));
  const res = await fetch(`${API_BASE}/api/public/companies?${params}`, { cache: "no-store" });
  if (!res.ok) return { companies: [], total: 0, page: 1, pageSize: 24 };
  const data = (await res.json()) as CompaniesResponse;
  return { companies: data.companies ?? [], total: data.total ?? 0, page: data.page ?? 1, pageSize: data.pageSize ?? 24 };
}

export default async function SponsorDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sector?: string; city?: string; kind?: string; verified?: string; page?: string }>;
}) {
  const { q = "", sector = "", city = "", kind = "", verified = "", page: pageParam = "" } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { companies, total, pageSize } = await getCompanies({ q, sector, city, kind, verified, page });

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

      <SmartSearch
        variant="directory"
        sectors={COMPANY_SECTORS}
        placeholder="Ex. : entreprises vérifiées de Montréal en événementiel…"
      />

      <DirectoryFilters
        sectors={COMPANY_SECTORS}
        q={q}
        sector={sector}
        city={city}
        extra={
          <div className="directory-filters-extra">
            <div>
              <label htmlFor="kind">Type de profil</label>
              <select id="kind" name="kind" defaultValue={kind}>
                <option value="">Tous</option>
                <option value="company">Entreprises</option>
                <option value="professional">Professionnels indépendants</option>
              </select>
            </div>
            <div className="check">
              <input id="verified" name="verified" type="checkbox" value="1" defaultChecked={verified === "1"} />
              <label htmlFor="verified" style={{ margin: 0, fontWeight: 400 }}>
                Profils vérifiés uniquement (domaine ou registre des entreprises)
              </label>
            </div>
          </div>
        }
      />

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
                      src={`${API_BASE}/api/public/companies/${co.id}/logo?thumb=1`}
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
                  {co.video_url && (
                    <a href={co.video_url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Vidéo" title="Voir la vidéo">
                      <PlayCircle />
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

      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        basePath="/sponsors"
        params={{ q, sector, city, kind, verified }}
      />

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
