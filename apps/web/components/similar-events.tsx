import Link from "next/link";
import { CalendarDays, MapPin, ArrowRight } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export interface SimilarEvent {
  title: string;
  starts_at: string;
  venue: string | null;
  public_slug: string;
  community_tag: string | null;
  cover_media_id: string | null;
  min_price_cents: number | null;
  currency: string | null;
}

export function formatMiniDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" }).format(new Date(iso));
}

export function miniPrice(ev: SimilarEvent): string | null {
  if (ev.min_price_cents === null) return null;
  if (ev.min_price_cents === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: ev.currency ?? "CAD",
    maximumFractionDigits: 0,
  }).format(ev.min_price_cents / 100);
}

/** Carte compacte partagée par le bandeau de la page événement et celui du billet. */
export function EventMiniCard({ ev }: { ev: SimilarEvent }) {
  const price = miniPrice(ev);
  return (
    <Link className="mini-card" href={`/e/${ev.public_slug}`}>
      {ev.cover_media_id ? (
        /* eslint-disable-next-line @next/next/no-img-element -- vignette WebP déjà redimensionnée par l'API */
        <img
          className="mini-cover"
          src={`${API_BASE}/api/public/media/${ev.cover_media_id}/file?thumb=1`}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="mini-cover mini-cover-fallback" aria-hidden="true" />
      )}
      <div className="mini-body">
        {ev.community_tag && <span className="ev-tag">{ev.community_tag}</span>}
        <h3>{ev.title}</h3>
        <p className="ev-meta">
          <CalendarDays size={13} aria-hidden="true" /> {formatMiniDate(ev.starts_at)}
          {price ? ` · ${price}` : ""}
        </p>
        {ev.venue && (
          <p className="ev-meta">
            <MapPin size={13} aria-hidden="true" /> {ev.venue}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * Bandeau de recirculation en bas d'une page événement.
 *
 * Composant serveur volontairement : ces liens internes sont la seule façon
 * pour un moteur de découvrir les autres événements depuis une page partagée,
 * et c'était jusqu'ici un cul-de-sac — un visiteur qui n'achetait pas repartait.
 */
export async function SimilarEvents({ slug }: { slug: string }) {
  let events: SimilarEvent[] = [];
  try {
    // `no-store` pour la même raison que la page événement qui nous rend :
    // le Data Cache de Next n'est pas opérationnel sur cette cible.
    const res = await fetch(`${API_BASE}/api/public/events/${slug}/similar`, { cache: "no-store" });
    if (res.ok) events = ((await res.json()) as { events: SimilarEvent[] }).events;
  } catch {
    // Suggestions indisponibles : la page événement se passe très bien du bandeau.
  }
  if (!events.length) return null;

  return (
    <section className="section similar-band">
      <div className="similar-head">
        <h2>À voir aussi</h2>
        <Link className="similar-all" href="/evenements">
          Tous les événements <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <div className="mini-grid">
        {events.map((ev) => (
          <EventMiniCard key={ev.public_slug} ev={ev} />
        ))}
      </div>
    </section>
  );
}
