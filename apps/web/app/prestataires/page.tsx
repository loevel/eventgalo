import type { Metadata } from "next";
import { BadgeCheck, Globe, MapPin, PlayCircle, Store } from "lucide-react";
import { COMPANY_SECTORS, MIN_REVIEWS_SHOWN, parseSocials, type SocialKey } from "@/lib/sponsor";
import { SOCIAL_ICON_COMPONENTS } from "@/components/social-icons";
import { DirectoryFilters } from "@/components/directory-filters";
import { Stars } from "@/components/star-rating";

/** Catégories les plus utiles côté prestataires, affichées en pilules rapides. */
const VENDOR_CHIP_SECTORS = ["Photographe", "Traiteur", "Musicien / DJ", "Décoration", "Fleuriste"] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export const metadata: Metadata = {
  title: "Annuaire des prestataires",
  description:
    "Trouvez un photographe, une salle de réception, un traiteur, un musicien ou un décorateur pour votre événement. Prestataires : inscrivez-vous gratuitement.",
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
}

async function getVendors(f: VendorFilters): Promise<DirectoryCompany[]> {
  const params = new URLSearchParams({ vendor: "1" });
  if (f.q) params.set("q", f.q);
  if (f.sector) params.set("sector", f.sector);
  if (f.city) params.set("city", f.city);
  const res = await fetch(`${API_BASE}/api/public/companies?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { companies: DirectoryCompany[] };
  return data.companies ?? [];
}

export default async function VendorDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sector?: string; city?: string }>;
}) {
  const { q = "", sector = "", city = "" } = await searchParams;
  const vendors = await getVendors({ q, sector, city });

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
