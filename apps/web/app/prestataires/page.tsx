import type { Metadata } from "next";
import { BadgeCheck, Globe, MapPin, PlayCircle, Store } from "lucide-react";
import { COMPANY_SECTORS, MIN_REVIEWS_SHOWN, parseSocials, type SocialKey } from "@/lib/sponsor";
import { SOCIAL_ICON_COMPONENTS } from "@/components/social-icons";
import { DirectoryFilters } from "@/components/directory-filters";
import { Stars } from "@/components/star-rating";
import { Pagination } from "@/components/pagination";

/** Catégories les plus utiles côté prestataires, affichées en pilules rapides. */
const VENDOR_CHIP_SECTORS = ["Photographe", "Traiteur", "Musicien / DJ", "Décoration", "Fleuriste"] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

const TITLE = "Annuaire des prestataires";
const DESCRIPTION =
  "Trouvez un photographe, une salle de réception, un traiteur, un musicien ou un décorateur pour votre événement. Prestataires : inscrivez-vous gratuitement.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://eventgalo.com/prestataires" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://eventgalo.com/prestataires",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og-default.png"] },
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
  avg_rating: number | null;
  review_count: number;
  video_url: string | null;
}

interface VendorFilters {
  q: string;
  sector: string;
  city: string;
  page: number;
}

interface VendorsResponse {
  companies: DirectoryCompany[];
  total: number;
  page: number;
  pageSize: number;
}

async function getVendors(f: VendorFilters): Promise<VendorsResponse> {
  const params = new URLSearchParams({ vendor: "1" });
  if (f.q) params.set("q", f.q);
  if (f.sector) params.set("sector", f.sector);
  if (f.city) params.set("city", f.city);
  if (f.page > 1) params.set("page", String(f.page));
  const res = await fetch(`${API_BASE}/api/public/companies?${params}`, { cache: "no-store" });
  if (!res.ok) return { companies: [], total: 0, page: 1, pageSize: 24 };
  const data = (await res.json()) as VendorsResponse;
  return { companies: data.companies ?? [], total: data.total ?? 0, page: data.page ?? 1, pageSize: data.pageSize ?? 24 };
}

export default async function VendorDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sector?: string; city?: string; page?: string }>;
}) {
  const { q = "", sector = "", city = "", page: pageParam = "" } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { companies: vendors, total, pageSize } = await getVendors({ q, sector, city, page });

  return (
    <main className="container">
      <div className="directory-hero">
        <span className="section-kicker">Annuaire</span>
        <h1 className="section-title">Des prestataires pour votre événement</h1>
        <p className="section-sub">
          Photographes, salles, traiteurs, musiciens, décorateurs… Trouvez qui il vous faut et contactez-les
          directement.
        </p>
      </div>

      <DirectoryFilters
        sectors={COMPANY_SECTORS}
        q={q}
        sector={sector}
        city={city}
        searchPlaceholder="Lieu, Photographe…"
        chipSectors={VENDOR_CHIP_SECTORS}
      />

      {vendors.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Aucun prestataire trouvé{q || sector || city ? " pour ces critères" : " pour le moment"}.
        </p>
      ) : (
        <div className="directory-grid">
          {vendors.map((co) => {
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
                {co.avg_rating != null && co.review_count >= MIN_REVIEWS_SHOWN && (
                  <Stars value={co.avg_rating} count={co.review_count} />
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
                <a className="btn btn-ghost btn-sm" href={`/sponsors/${co.id}`} style={{ marginTop: 8 }}>
                  Voir le profil
                </a>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} total={total} pageSize={pageSize} basePath="/prestataires" params={{ q, sector, city }} />

      <div className="card directory-cta">
        <Store size={26} style={{ color: "var(--accent)" }} />
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Vous êtes photographe, traiteur, DJ, décorateur… ?</h3>
          <p className="muted" style={{ margin: 0 }}>
            Inscrivez-vous gratuitement dans l&apos;annuaire : les organisateurs d&apos;événements pourront vous
            découvrir et vous contacter.
          </p>
        </div>
        <a className="btn btn-accent" href="/entreprise" style={{ marginTop: 0, whiteSpace: "nowrap" }}>
          Créer mon profil
        </a>
      </div>
    </main>
  );
}
