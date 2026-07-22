import type { Metadata } from "next";
import { CalendarDays, MapPin, Search, Ticket } from "lucide-react";
import { ApplySponsorship } from "@/components/apply-sponsorship";
import { SmartSearch } from "@/components/smart-search";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export const metadata: Metadata = {
  title: "Événements à sponsoriser",
  description:
    "Galas, soirées et événements communautaires qui cherchent des sponsors : découvrez les paliers de sponsoring et proposez votre entreprise.",
};

interface Opportunity {
  id: string;
  title: string;
  starts_at: string | null;
  venue: string | null;
  address: string | null;
  public_slug: string;
  logo_media_id: string | null;
  tiers: Array<{
    id: string;
    name: string;
    price_cents: number;
    currency: string;
    quantity: number;
    taken: number;
    perks: string | null;
  }>;
}

async function getOpportunities(q: string, from: string, to: string): Promise<Opportunity[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${API_BASE}/api/public/companies/opportunities?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { events: Opportunity[] };
  return data.events ?? [];
}

function formatDate(iso: string | null): string {
  if (!iso) return "Date à venir";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(cents / 100);
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const { q = "", from = "", to = "" } = await searchParams;
  const events = await getOpportunities(q, from, to);

  return (
    <main className="container">
      <div className="directory-hero">
        <span className="section-kicker">Opportunités</span>
        <h1 className="section-title">Événements à sponsoriser</h1>
        <p className="section-sub">
          Ces événements cherchent des sponsors. Découvrez les paliers proposés et leurs avantages, puis
          proposez votre entreprise en quelques clics.
        </p>
      </div>

      <SmartSearch<{ q: string; from: string; to: string }>
        endpoint="/api/public/companies/opportunities/search-parse"
        placeholder="Ex. : galas à Montréal en septembre…"
        toParams={(f) => {
          const p = new URLSearchParams();
          if (f.q) p.set("q", f.q);
          if (f.from) p.set("from", f.from);
          if (f.to) p.set("to", f.to);
          return p;
        }}
      />

      <form className="card directory-filters" method="GET">
        <label htmlFor="q">Recherche</label>
        <div className="copy-row">
          <input id="q" name="q" defaultValue={q} placeholder="Nom de l'événement, ville, salle…" />
          <button type="submit" className="btn-sm btn-accent" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Search size={14} /> Chercher
          </button>
        </div>
      </form>

      {(from || to) && (
        <p className="muted" style={{ textAlign: "center", marginTop: -6, marginBottom: 12, fontSize: 13 }}>
          Période : {from ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "long" }).format(new Date(`${from}T00:00:00`)) : "…"}
          {" → "}
          {to ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "long" }).format(new Date(`${to}T00:00:00`)) : "…"}
          {" "}
          <a href="/opportunites" style={{ marginLeft: 6 }}>Réinitialiser</a>
        </p>
      )}

      {events.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Aucun événement en recherche de sponsors{q || from || to ? " pour ces critères" : " pour le moment"}.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720, margin: "20px auto 0" }}>
          {events.map((ev) => (
            <div key={ev.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {ev.logo_media_id && (
                  <img
                    src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file`}
                    alt=""
                    loading="lazy"
                    style={{ width: 58, height: 58, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 5, flex: "none" }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19 }}>
                    {ev.title}
                  </h3>
                  <p className="muted directory-meta" style={{ fontSize: 13 }}>
                    <span><CalendarDays size={13} /> {formatDate(ev.starts_at)}</span>
                    {ev.venue && (
                      <span><MapPin size={13} /> {ev.venue}</span>
                    )}
                  </p>
                </div>
                <a className="btn btn-ghost btn-sm" href={`/e/${ev.public_slug}`} target="_blank" style={{ marginTop: 0 }}>
                  <Ticket size={13} /> Voir l&apos;événement
                </a>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
                {ev.tiers.map((t) => {
                  const remaining = t.quantity - t.taken;
                  return (
                    <span key={t.id} className={`badge ${remaining > 0 ? "warn" : "mut"}`}>
                      {t.name} · {formatPrice(t.price_cents, t.currency)}
                      {remaining > 0 ? ` · ${remaining} place${remaining > 1 ? "s" : ""}` : " · complet"}
                    </span>
                  );
                })}
              </div>
              <ApplySponsorship eventId={ev.id} eventTitle={ev.title} tiers={ev.tiers} />
            </div>
          ))}
        </div>
      )}

      <div className="card directory-cta">
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Organisateur ?</h3>
          <p className="muted" style={{ margin: 0 }}>
            Créez des paliers de sponsoring pour votre événement et il apparaîtra automatiquement ici, sous les
            yeux des entreprises inscrites.
          </p>
        </div>
        <a className="btn btn-accent" href="/dashboard" style={{ marginTop: 0, whiteSpace: "nowrap" }}>
          Mon espace
        </a>
      </div>
    </main>
  );
}
