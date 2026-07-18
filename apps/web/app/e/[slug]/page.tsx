import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ticket, PartyPopper, CalendarPlus, CalendarDays, MapPin, Shirt, Hourglass, Megaphone, ArrowRight, Clock, Navigation, Camera, Handshake } from "lucide-react";
import { CheckoutForm } from "@/components/checkout-form";
import { Reveal } from "@/components/reveal";
import { Countdown } from "@/components/countdown";
import { ShareButton } from "@/components/share-button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

interface PublicEvent {
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  dress_code: string | null;
  type: string;
  public_slug: string;
  cover_media_id: string | null;
  logo_media_id: string | null;
}

interface EventPayload {
  event: PublicEvent;
  categories: Array<{
    id: string;
    name: string;
    perks: string | null;
    price_cents: number;
    currency: string;
    quantity: number;
    sold: number;
  }>;
  announcements: Array<{ body: string; created_at: string }>;
  gallery: Array<{ id: string; content_type: string }>;
  sponsors: Array<{
    company_name: string;
    website: string | null;
    logo_media_id: string | null;
    tier_name: string;
    tier_rank: number;
  }>;
}

async function getEvent(slug: string): Promise<EventPayload | null> {
  const res = await fetch(`${API_BASE}/api/public/events/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as EventPayload;
  data.gallery ??= [];
  data.sponsors ??= [];
  data.announcements ??= [];
  return data;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeStyle: "short" }).format(new Date(iso));
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** "2 h 30" à partir d'un intervalle début/fin. */
function formatDuration(startsAt: string, endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} j${hours > 0 ? ` ${hours} h` : ""}`;
  if (hours > 0) return `${hours} h${minutes > 0 ? ` ${String(minutes).padStart(2, "0")}` : ""}`;
  return `${minutes} min`;
}

function truncate(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getEvent(slug);
  if (!data) return { title: "Événement introuvable", robots: { index: false } };
  const ev = data.event;
  const description = ev.description
    ? truncate(ev.description)
    : `${ev.title} — ${formatDate(ev.starts_at)}${ev.venue ? ` · ${ev.venue}` : ""}`;
  return {
    title: ev.title,
    description,
    openGraph: {
      type: "website",
      title: ev.title,
      description,
      url: `https://eventgalo.com/e/${slug}`,
    },
    twitter: { card: "summary", title: ev.title, description },
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getEvent(slug);
  if (!data) notFound();

  const ev = data.event;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: ev.title,
    ...(ev.description ? { description: ev.description } : {}),
    ...(ev.starts_at ? { startDate: ev.starts_at } : {}),
    ...(ev.ends_at ? { endDate: ev.ends_at } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(ev.venue
      ? {
          location: {
            "@type": "Place",
            name: ev.venue,
            ...(ev.address ? { address: ev.address } : {}),
          },
        }
      : {}),
    url: `https://eventgalo.com/e/${slug}`,
    organizer: { "@type": "Organization", name: "EventGalo", url: "https://eventgalo.com" },
    ...(ev.type === "ticketed" && data.categories.length > 0
      ? {
          offers: data.categories.map((c) => ({
            "@type": "Offer",
            name: c.name,
            price: (c.price_cents / 100).toFixed(2),
            priceCurrency: c.currency,
            availability:
              c.sold < c.quantity ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
            url: `https://eventgalo.com/e/${slug}`,
          })),
        }
      : {}),
  };

  const pageUrl = `https://eventgalo.com/e/${slug}`;
  const coverUrl = ev.cover_media_id ? `${API_BASE}/api/public/media/${ev.cover_media_id}/file` : null;

  const duration = ev.starts_at && ev.ends_at ? formatDuration(ev.starts_at, ev.ends_at) : null;
  const endLabel =
    ev.starts_at && ev.ends_at && duration
      ? sameDay(ev.starts_at, ev.ends_at)
        ? `Jusqu'à ${formatTime(ev.ends_at)} (${duration})`
        : `Jusqu'au ${formatDate(ev.ends_at)} (${duration})`
      : null;

  const mapQuery = [ev.venue, ev.address].filter(Boolean).join(", ");
  const mapEmbedUrl = mapQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed` : null;
  const mapDirectionsUrl = mapQuery
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`
    : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className={`event-hero ${coverUrl ? "has-image" : ""}`}>
        {coverUrl ? (
          <img className="hero-bg" src={coverUrl} alt="" />
        ) : (
          <div className="hero-gradient-bg">
            <div className="hero-blob b1" />
            <div className="hero-blob b2" />
          </div>
        )}
        <div className="hero-overlay" />
        <div className="hero-content">
          {ev.logo_media_id && (
            <img
              className="event-logo"
              src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file`}
              alt={`Logo — ${ev.title}`}
            />
          )}
          <span className="hero-badge glass glass-chip">
            {ev.type === "ticketed" ? <Ticket /> : <PartyPopper />}
            {ev.type === "ticketed" ? "Billetterie" : "Invitation"}
          </span>
          <h1>{ev.title}</h1>
          <div className="hero-cta-row">
            <a className="btn glass glass-btn" href={`${API_BASE}/api/public/events/${slug}/ics`}>
              <CalendarPlus /> Ajouter à mon agenda
            </a>
            <ShareButton title={ev.title} url={pageUrl} />
            {ev.type === "ticketed" && (
              <a className="btn btn-accent" href="#billets">
                Voir les billets <ArrowRight />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="event-info-wrap">
        <div className="event-info-bar glass">
          <div className="event-info-item">
            <CalendarDays />
            <span>{formatDate(ev.starts_at)}</span>
          </div>
          {endLabel && (
            <div className="event-info-item">
              <Clock />
              <span>{endLabel}</span>
            </div>
          )}
          {ev.venue && (
            <div className="event-info-item">
              <MapPin />
              <span>{ev.venue}{ev.address ? `, ${ev.address}` : ""}</span>
            </div>
          )}
          {ev.dress_code && (
            <div className="event-info-item">
              <Shirt />
              <span>{ev.dress_code}</span>
            </div>
          )}
        </div>
      </div>

      <main className="container">
        <div className="event-layout">
          <div className="event-main">
            {ev.description && (
              <Reveal>
                <div className="card">
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{ev.description}</p>
                </div>
              </Reveal>
            )}

            {data.gallery.length > 0 && (
              <Reveal delay={60}>
                <div className="card">
                  <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Camera size={17} /> En images
                  </h3>
                  <div className="event-gallery">
                    {data.gallery.map((m) => (
                      <img
                        key={m.id}
                        src={`${API_BASE}/api/public/media/${m.id}/file`}
                        alt=""
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
              </Reveal>
            )}

            {data.announcements.length > 0 && (
              <Reveal delay={80}>
                <div className="card">
                  <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Megaphone size={17} /> Dernières annonces
                  </h3>
                  {data.announcements.map((a, i) => (
                    <div key={i} className="timeline-item">
                      <p style={{ margin: 0 }}>{a.body}</p>
                      <span className="muted" style={{ fontSize: 12 }}>{formatDate(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            {ev.type === "ticketed" && (
              <Reveal delay={140}>
                <div className="card" id="billets">
                  <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <Ticket size={20} /> Billets
                  </h2>
                  <CheckoutForm slug={slug} categories={data.categories} />
                </div>
              </Reveal>
            )}
          </div>

          <aside className="event-sidebar">
            {ev.starts_at && (
              <Reveal>
                <div className="card" style={{ margin: 0 }}>
                  <h3 style={{ marginTop: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
                    <Hourglass size={15} /> Compte à rebours
                  </h3>
                  <Countdown startsAt={ev.starts_at} />
                </div>
              </Reveal>
            )}
            {mapEmbedUrl && (
              <Reveal delay={60}>
                <div className="card map-card" style={{ margin: 0 }}>
                  <h3 style={{ marginTop: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
                    <MapPin size={15} /> S&apos;y rendre
                  </h3>
                  <div className="map-frame">
                    <iframe
                      src={mapEmbedUrl}
                      title={`Carte : ${mapQuery}`}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                  <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
                    {ev.venue && <strong style={{ color: "var(--ink)" }}>{ev.venue}</strong>}
                    {ev.venue && ev.address && <br />}
                    {ev.address}
                  </p>
                  {mapDirectionsUrl && (
                    <a
                      className="btn btn-ghost btn-sm map-directions"
                      href={mapDirectionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Navigation size={14} /> Itinéraire
                    </a>
                  )}
                </div>
              </Reveal>
            )}
            {ev.type === "private" && (
              <Reveal delay={80}>
                <div className="card" style={{ margin: 0 }}>
                  <p className="muted" style={{ margin: 0 }}>
                    Cet événement est sur invitation. Utilisez le lien personnel reçu par email pour confirmer
                    votre présence.
                  </p>
                </div>
              </Reveal>
            )}
          </aside>
        </div>

        {data.sponsors.length > 0 && (
          <Reveal delay={60}>
            <section className="sponsors-section">
              <h2 className="sponsors-title">
                <Handshake /> Ils soutiennent l&apos;événement
              </h2>
              {Object.entries(
                data.sponsors.reduce<Record<string, typeof data.sponsors>>((acc, s) => {
                  (acc[s.tier_name] ??= []).push(s);
                  return acc;
                }, {}),
              ).map(([tierName, list], tierIdx) => (
                <div key={tierName} className={`sponsor-tier-group ${tierIdx === 0 ? "top-tier" : ""}`}>
                  <h3>{tierName}</h3>
                  <div className="sponsor-logos">
                    {list.map((s, i) => {
                      const inner = (
                        <>
                          {s.logo_media_id ? (
                            <img src={`${API_BASE}/api/public/media/${s.logo_media_id}/file`} alt={s.company_name} loading="lazy" />
                          ) : (
                            <span className="sponsor-name-fallback">{s.company_name.charAt(0).toUpperCase()}</span>
                          )}
                          <span className="sponsor-name">{s.company_name}</span>
                        </>
                      );
                      return s.website ? (
                        <a key={i} className="sponsor-card" href={s.website} target="_blank" rel="noopener noreferrer nofollow">
                          {inner}
                        </a>
                      ) : (
                        <div key={i} className="sponsor-card">
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          </Reveal>
        )}
      </main>
    </>
  );
}
