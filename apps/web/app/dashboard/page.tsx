"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, formatDate, getToken } from "@/lib/api";

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
      .then((r) => setEvents(r.events))
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>Mes événements</h1>
        <Link href="/dashboard/new" className="btn btn-accent">
          + Créer un événement
        </Link>
      </div>

      {error && <div className="alert err">{error}</div>}

      {events === null && !error && (
        <div className="grid2" style={{ marginTop: 14 }}>
          {[0, 1].map((i) => (
            <div key={i} className="card" style={{ opacity: 0.5 }}>
              <div className="muted">Chargement…</div>
            </div>
          ))}
        </div>
      )}

      {stats && events && events.length > 0 && (
        <div className="grid3" style={{ marginTop: 14 }}>
          <div className="card stat">
            <div className="num">{stats.upcoming}</div>
            <div className="lbl">Événements à venir</div>
          </div>
          <div className="card stat">
            <div className="num">{stats.confirmed}</div>
            <div className="lbl">Invités confirmés</div>
          </div>
          <div className="card stat">
            <div className="num">{stats.ticketsSold}</div>
            <div className="lbl">Billets vendus</div>
          </div>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="tabs">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {events?.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: 32, margin: "0 0 8px" }}>🎉</p>
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>Aucun événement pour le moment</p>
          <p className="muted" style={{ margin: "0 0 16px" }}>
            Créez votre premier événement : anniversaire, gala, soirée communautaire…
          </p>
          <Link href="/dashboard/new" className="btn btn-accent">
            + Créer un événement
          </Link>
        </div>
      )}

      {filtered && filtered.length === 0 && events && events.length > 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Aucun événement dans cette catégorie.</p>
        </div>
      )}

      {filtered?.map((e) => (
        <Link key={e.id} href={`/dashboard/e/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <strong style={{ fontSize: 17 }}>
                  {e.type === "ticketed" ? "🎟️ " : "🎂 "}
                  {e.title}
                  {!e.is_owner && (
                    <span className="badge mut" style={{ marginLeft: 8, fontWeight: 400 }}>
                      Co-organisé
                    </span>
                  )}
                </strong>
                <div className="muted">{relativeDate(e.starts_at)} · {formatDate(e.starts_at)}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13 }}>
                {e.status !== "published" && (
                  <span className={`badge ${e.status === "draft" ? "warn" : "mut"}`}>
                    {e.status === "draft" ? "Brouillon" : "Archivé"}
                  </span>
                )}
                <div className="muted" style={{ marginTop: 6 }}>
                  {e.yes_count}/{e.guest_count} confirmés
                  {e.type === "ticketed" ? ` · ${e.tickets_sold} billets` : ""}
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </main>
  );
}
