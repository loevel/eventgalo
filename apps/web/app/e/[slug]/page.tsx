import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";

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
}

interface EventPayload {
  event: PublicEvent;
  categories: Array<{
    id: string;
    name: string;
    price_cents: number;
    currency: string;
    quantity: number;
    sold: number;
  }>;
  announcements: Array<{ body: string; created_at: string }>;
}

async function getEvent(slug: string): Promise<EventPayload | null> {
  const res = await fetch(`${API_BASE}/api/public/events/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
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

  return (
    <main className="container narrow">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{ev.title}</h1>
      <p className="muted">
        📅 {formatDate(ev.starts_at)}
        {ev.venue ? <><br />📍 {ev.venue}{ev.address ? `, ${ev.address}` : ""}</> : null}
        {ev.dress_code ? <><br />👗 Dress code : {ev.dress_code}</> : null}
      </p>
      {ev.description && (
        <div className="card">
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{ev.description}</p>
        </div>
      )}

      {data.announcements.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dernières annonces</h3>
          {data.announcements.map((a, i) => (
            <p key={i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              {a.body} <span className="muted">— {formatDate(a.created_at)}</span>
            </p>
          ))}
        </div>
      )}

      {ev.type === "ticketed" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>🎟️ Billets</h2>
          <CheckoutForm slug={slug} categories={data.categories} />
        </div>
      )}
    </main>
  );
}
