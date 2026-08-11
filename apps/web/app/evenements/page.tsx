import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, Ticket, SearchX, ArrowRight } from "lucide-react";
import { DiscoverFilters } from "@/components/discover-filters";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export const metadata: Metadata = {
  title: "Tous les événements à venir",
  description:
    "Galas, soirées communautaires, anniversaires et événements culturels à venir : trouvez le prochain près de chez vous et réservez votre billet en ligne.",
  alternates: { canonical: "/evenements" },
  openGraph: {
    type: "website",
    url: "https://eventgalo.com/evenements",
    title: "Tous les événements à venir — EventGalo",
    description: "Galas, soirées communautaires et événements culturels à venir. Réservez votre billet en ligne.",
  },
};

interface DiscoverEvent {
  title: string;
  description: string | null;
  starts_at: string;
  venue: string | null;
  public_slug: string;
  type: string;
  community_tag: string | null;
  cover_media_id: string | null;
  logo_media_id: string | null;
  min_price_cents: number | null;
  currency: string | null;
  seats_left: number;
}

interface Facet {
  value: string;
  n: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function getDiscover(params: SearchParams) {
  const query = new URLSearchParams();
  for (const key of ["q", "tag", "city", "type", "free", "page"]) {
    const value = one(params, key);
    if (value) query.set(key, value);
  }
  const [listRes, facetRes] = await Promise.all([
    fetch(`${API_BASE}/api/public/discover?${query}`, { next: { revalidate: 120 } }),
    fetch(`${API_BASE}/api/public/discover/facets`, { next: { revalidate: 600 } }),
  ]);
  if (!listRes.ok) return null;
  const list = (await listRes.json()) as {
    events: DiscoverEvent[];
    page: number;
    page_size: number;
    total: number;
  };
  const facets = facetRes.ok
    ? ((await facetRes.json()) as { tags: Facet[]; cities: Facet[] })
    : { tags: [], cities: [] };
  return { ...list, facets };
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { weekday: "short", day: "numeric", month: "long" }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeStyle: "short" }).format(new Date(iso));
}

function priceLabel(ev: DiscoverEvent): string {
  if (ev.type !== "ticketed" || ev.min_price_cents === null) return "Sur invitation";
  if (ev.min_price_cents === 0) return "Gratuit";
  const formatted = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: ev.currency ?? "CAD",
  }).format(ev.min_price_cents / 100);
  return `dès ${formatted}`;
}

export default async function EvenementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const data = await getDiscover(params);

  if (!data) {
    return (
      <main className="container">
        <div className="alert err" role="alert">
          La liste des événements est momentanément indisponible. Réessayez dans quelques instants.
        </div>
      </main>
    );
  }

  const { events, page, page_size, total, facets } = data;
  const lastPage = Math.max(1, Math.ceil(total / page_size));
  const hasFilters = ["q", "tag", "city", "type", "free"].some((k) => one(params, k));

  // Un flux d'événements est exactement ce que les moteurs savent afficher en
  // résultat enrichi : on le déclare, page par page.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: events.map((ev, i) => ({
      "@type": "ListItem",
      position: (page - 1) * page_size + i + 1,
      url: `https://eventgalo.com/e/${ev.public_slug}`,
      name: ev.title,
    })),
  };

  return (
    <main className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="listing-head">
        <h1>Événements à venir</h1>
        <p className="muted">
          {total === 0
            ? "Aucun événement publié pour le moment."
            : `${total} événement${total > 1 ? "s" : ""} à venir — galas, soirées communautaires, anniversaires.`}
        </p>
      </header>

      <DiscoverFilters tags={facets.tags} cities={facets.cities} />

      {events.length === 0 ? (
        <div className="card empty-state">
          <SearchX size={28} aria-hidden="true" />
          <h2>{hasFilters ? "Aucun événement ne correspond" : "Rien de prévu pour l'instant"}</h2>
          <p className="muted">
            {hasFilters
              ? "Élargissez votre recherche : retirez un filtre ou essayez une autre ville."
              : "Les prochains événements apparaîtront ici dès leur publication."}
          </p>
          {hasFilters ? (
            <Link className="btn-accent" href="/evenements">
              Voir tous les événements
            </Link>
          ) : (
            <Link className="btn-accent" href="/dashboard/new">
              Créer mon événement <ArrowRight size={16} />
            </Link>
          )}
        </div>
      ) : (
        <div className="card-grid">
          {events.map((ev) => (
            <Link key={ev.public_slug} className="ev-card" href={`/e/${ev.public_slug}`}>
              {ev.cover_media_id ? (
                /* eslint-disable-next-line @next/next/no-img-element -- vignette WebP déjà redimensionnée par l'API */
                <img
                  className="ev-cover"
                  src={`${API_BASE}/api/public/media/${ev.cover_media_id}/file?thumb=1`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div className="ev-cover ev-cover-fallback" aria-hidden="true" />
              )}
              <div className="ev-card-body">
                {ev.community_tag && <span className="ev-tag">{ev.community_tag}</span>}
                <h2>{ev.title}</h2>
                <p className="ev-meta">
                  <CalendarDays size={14} aria-hidden="true" /> {formatDay(ev.starts_at)} · {formatTime(ev.starts_at)}
                </p>
                {ev.venue && (
                  <p className="ev-meta">
                    <MapPin size={14} aria-hidden="true" /> {ev.venue}
                  </p>
                )}
                <div className="ev-card-foot">
                  <span className="ev-price">
                    <Ticket size={14} aria-hidden="true" /> {priceLabel(ev)}
                  </span>
                  {ev.type === "ticketed" && ev.seats_left > 0 && ev.seats_left <= 10 && (
                    <span className="badge err">Plus que {ev.seats_left}</span>
                  )}
                  {ev.type === "ticketed" && ev.seats_left === 0 && <span className="badge mut">Complet</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <nav className="listing-pager" aria-label="Pagination">
          {page > 1 && (
            <Link className="btn-ghost btn-sm" href={pageHref(params, page - 1)} rel="prev">
              ← Précédent
            </Link>
          )}
          <span className="muted">
            Page {page} sur {lastPage}
          </span>
          {page < lastPage && (
            <Link className="btn-ghost btn-sm" href={pageHref(params, page + 1)} rel="next">
              Suivant →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const key of ["q", "tag", "city", "type", "free"]) {
    const value = one(params, key);
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `/evenements?${qs}` : "/evenements";
}
