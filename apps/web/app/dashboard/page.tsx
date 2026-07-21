"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, PartyPopper, Plus, Ticket, Users } from "lucide-react";
import { api, formatDate, getToken } from "@/lib/api";
import { Reveal } from "@/components/reveal";
import { ConnectPaymentsCard } from "@/components/connect-payments";

interface EventListItem {
  id: string;
  title: string;
  starts_at: string;
  type: string;
  status: string;
  guest_count: number;
  yes_count: number;
  tickets_sold: number;
  is_owner: number;
}

const FILTERS = [
  { key: "upcoming", label: "À venir" },
  { key: "draft", label: "Brouillons" },
  { key: "past", label: "Passés" },
  { key: "all", label: "Tous" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const STATUS_ACCENT: Record<string, string> = {
  published: "border-l-ok",
  draft: "border-l-gold",
  archived: "border-l-line",
};

function relativeDate(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays === -1) return "Hier";
  if (diffDays > 1 && diffDays <= 30) return `Dans ${diffDays} jours`;
  if (diffDays < -1 && diffDays >= -30) return `Il y a ${-diffDays} jours`;
  return formatDate(iso);
}

export default function Dashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("upcoming");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<{ events: EventListItem[] }>("/api/events")
      .then(async (r) => {
        // Un compte sans événement mais avec un profil entreprise/prestataire
        // est probablement venu pour le sponsoring ou l'annuaire, pas pour
        // organiser — on l'amène directement à son profil plutôt que sur un
        // tableau de bord d'organisateur vide.
        if (r.events.length === 0) {
          try {
            const companyRes = await api<{ company: { id: string } | null }>("/api/company");
            if (companyRes.company) {
              router.replace("/entreprise");
              return;
            }
          } catch {
            // Pas de profil entreprise (ou erreur réseau) : on affiche le tableau de bord normalement.
          }
        }
        setEvents(r.events);
      })
      .catch((e) => {
        if (e.status === 401) router.replace("/");
        else setError(e.message);
      });
  }, [router]);

  const stats = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    return {
      upcoming: events.filter((e) => e.status === "published" && new Date(e.starts_at).getTime() >= now).length,
      confirmed: events.reduce((s, e) => s + e.yes_count, 0),
      ticketsSold: events.reduce((s, e) => s + e.tickets_sold, 0),
    };
  }, [events]);

  const filtered = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    const sorted = [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    switch (filter) {
      case "upcoming":
        return sorted.filter((e) => e.status !== "archived" && new Date(e.starts_at).getTime() >= now);
      case "draft":
        return sorted.filter((e) => e.status === "draft");
      case "past":
        return sorted.filter((e) => new Date(e.starts_at).getTime() < now).reverse();
      case "all":
      default:
        return sorted;
    }
  }, [events, filter]);

  return (
    <main className="container">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight mb-0">Mes événements</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/analytics"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-line/40"
          >
            Analyses
          </Link>
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
          >
            <Plus size={16} /> Créer un événement
          </Link>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}

      {events !== null && <ConnectPaymentsCard />}

      {events === null && !error && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      )}

      {stats && events && events.length > 0 && (
        <Reveal>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: CalendarDays, num: stats.upcoming, lbl: "Événements à venir" },
              { icon: Users, num: stats.confirmed, lbl: "Invités confirmés" },
              { icon: Ticket, num: stats.ticketsSold, lbl: "Billets vendus" },
            ].map(({ icon: Icon, num, lbl }) => (
              <div
                key={lbl}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Icon size={18} />
                </div>
                <div>
                  <div className="font-display text-2xl font-semibold leading-tight text-ink">{num}</div>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{lbl}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {events && events.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 border-b border-line pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filter === f.key
                  ? "bg-ink text-white shadow-sm"
                  : "text-muted hover:bg-line/60 hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {events?.length === 0 && (
        <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="mb-2 text-4xl">🎉</p>
          <p className="mb-1 font-semibold text-ink">Aucun événement pour le moment</p>
          <p className="mb-5 text-sm text-muted">
            Créez votre premier événement : anniversaire, gala, soirée communautaire…
          </p>
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md"
          >
            <Plus size={16} /> Créer un événement
          </Link>
        </div>
      )}

      {filtered && filtered.length === 0 && events && events.length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          Aucun événement dans cette catégorie.
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {filtered?.map((e, i) => (
          <Reveal key={e.id} delay={Math.min(i, 6) * 60}>
            <Link href={`/dashboard/e/${e.id}`} className="block no-underline text-inherit">
              <div
                className={`flex items-center justify-between gap-3 rounded-xl border border-line border-l-4 ${
                  STATUS_ACCENT[e.status] ?? "border-l-line"
                } bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent/10 text-lg">
                    {e.type === "ticketed" ? <Ticket size={18} className="text-accent" /> : <PartyPopper size={18} className="text-accent" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-ink">
                      {e.title}
                      {!e.is_owner && (
                        <span className="badge mut" style={{ fontWeight: 400 }}>
                          Co-organisé
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted">{relativeDate(e.starts_at)} · {formatDate(e.starts_at)}</div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  {e.status !== "published" && (
                    <span className={`badge ${e.status === "draft" ? "warn" : "mut"}`}>
                      {e.status === "draft" ? "Brouillon" : "Archivé"}
                    </span>
                  )}
                  <div className="mt-1.5 text-muted">
                    {e.yes_count}/{e.guest_count} confirmés
                    {e.type === "ticketed" ? ` · ${e.tickets_sold} billets` : ""}
                  </div>
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </main>
  );
}
