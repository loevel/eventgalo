import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronLeft, Globe, MapPin } from "lucide-react";
import { parseSocials, videoEmbedUrl, type SocialKey } from "@/lib/sponsor";
import { SOCIAL_ICON_COMPONENTS } from "@/components/social-icons";
import { ProposeSponsorship } from "@/components/propose-sponsorship";
import { Stars } from "@/components/star-rating";
import { CompanyReviewSummary } from "@/components/company-review-summary";

const MIN_REVIEWS_SHOWN = 3;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

interface CompanyProfile {
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
  public_email: string | null;
  video_url: string | null;
  has_logo: number;
  verified: number;
  sponsorships: number;
  avg_rating: number | null;
  review_count: number;
}

interface SponsoredEvent {
  title: string;
  public_slug: string;
  starts_at: string | null;
  tier_name: string | null;
}

async function getCompany(id: string): Promise<{ company: CompanyProfile; events: SponsoredEvent[] } | null> {
  const res = await fetch(`${API_BASE}/api/public/companies/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as { company: CompanyProfile; events: SponsoredEvent[] };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "long" }).format(new Date(iso));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getCompany(id);
  if (!data) return { title: "Profil introuvable", robots: { index: false } };
  const { company: co } = data;
  const pro = co.kind === "professional";
  const title = pro && co.title ? `${co.name}, ${co.title}` : co.name;
  const description =
    co.description?.slice(0, 160) ??
    (pro
      ? `${co.name}${co.title ? `, ${co.title}` : ""} — profil professionnel sur EventGalo.`
      : `${co.name}${co.sector ? ` — ${co.sector}` : ""} — profil entreprise sur EventGalo.`);
  const logoUrl = co.has_logo ? `${API_BASE}/api/public/companies/${co.id}/logo` : undefined;
  return {
    title,
    description,
    alternates: { canonical: `https://eventgalo.com/sponsors/${co.id}` },
    openGraph: {
      type: "profile",
      title,
      description,
      url: `https://eventgalo.com/sponsors/${co.id}`,
      ...(logoUrl ? { images: [{ url: logoUrl }] } : {}),
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCompany(id);
  if (!data) notFound();
  const { company: co, events } = data;
  const pro = co.kind === "professional";
  const socials = Object.entries(parseSocials(co.socials)) as Array<[SocialKey, string]>;
  const embed = videoEmbedUrl(co.video_url);
  const logoUrl = co.has_logo ? `${API_BASE}/api/public/companies/${co.id}/logo` : null;
  const showRating = co.avg_rating != null && co.review_count >= MIN_REVIEWS_SHOWN;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": pro ? "Person" : "Organization",
    name: co.name,
    url: `https://eventgalo.com/sponsors/${co.id}`,
    ...(logoUrl ? { image: logoUrl } : {}),
    ...(co.website ? { sameAs: [co.website, ...socials.map(([, url]) => url)] } : socials.length ? { sameAs: socials.map(([, url]) => url) } : {}),
    ...(pro && co.title ? { jobTitle: co.title } : {}),
    ...(!pro && co.description ? { description: co.description } : {}),
    ...(showRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: co.avg_rating,
            reviewCount: co.review_count,
          },
        }
      : {}),
  };

  return (
    <main className="container narrow">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <a href="/sponsors" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14 }}>
        <ChevronLeft size={16} /> Retour à l&apos;annuaire
      </a>

      <div className="card directory-card" style={{ marginTop: 16 }}>
        <div className="directory-card-head">
          {logoUrl ? (
            <img src={logoUrl} alt={co.name} className={pro ? "pro-photo" : undefined} style={{ width: 84, height: 84 }} />
          ) : (
            <span className="sponsor-name-fallback" style={{ width: 84, height: 84, fontSize: 28 }}>
              {co.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 style={{ fontSize: 24, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              {co.name}
              {Boolean(co.verified) && (
                <span
                  className="badge ok"
                  style={{ fontSize: 12 }}
                  title={pro ? "Professionnel vérifié (affiliation ou registre)" : "Entreprise vérifiée (domaine ou registre des entreprises)"}
                >
                  <BadgeCheck size={12} /> {pro ? "Pro vérifié" : "Vérifiée"}
                </span>
              )}
            </h1>
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
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          {co.sponsorships > 0 && (
            <span className="badge ok directory-badge">
              <BadgeCheck size={12} /> {co.sponsorships} événement{co.sponsorships > 1 ? "s" : ""} sponsorisé{co.sponsorships > 1 ? "s" : ""}
            </span>
          )}
          {showRating && <Stars value={co.avg_rating!} count={co.review_count} />}
        </div>

        {showRating && <CompanyReviewSummary companyId={co.id} />}

        {co.description && <p className="sponsor-desc">{co.description}</p>}

        {embed && (
          <div className="sponsor-video" style={{ marginTop: 16 }}>
            <iframe src={embed} title={`Vidéo — ${co.name}`} allowFullScreen loading="lazy" />
          </div>
        )}

        <div className="sponsor-links" style={{ marginTop: 16 }}>
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

      {events.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Événements sponsorisés</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {events.map((e) => (
              <li key={e.public_slug} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <a href={`/e/${e.public_slug}`} style={{ fontWeight: 600 }}>{e.title}</a>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>
                  {formatDate(e.starts_at)}{e.tier_name ? ` · ${e.tier_name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
