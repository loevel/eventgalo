"use client";

import { useEffect, useState } from "react";
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
}

export default function Dashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="container">
      <h1>Mes événements</h1>
      <Link href="/dashboard/new" className="btn btn-accent">
        + Créer un événement
      </Link>
      {error && <div className="alert err">{error}</div>}
      {events === null && !error && <p className="muted">Chargement…</p>}
      {events?.length === 0 && (
        <div className="card">
          <p className="muted">Aucun événement pour le moment. Créez le premier !</p>
        </div>
      )}
      {events?.map((e) => (
        <Link key={e.id} href={`/dashboard/e/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <strong style={{ fontSize: 17 }}>{e.title}</strong>
                <div className="muted">{formatDate(e.starts_at)}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13 }}>
                <span className={`badge ${e.status === "archived" ? "mut" : "ok"}`}>
                  {e.type === "ticketed" ? "Billetterie" : "Privé"}
                </span>
                {e.status !== "published" && (
                  <>
                    {" "}
                    <span className={`badge ${e.status === "draft" ? "warn" : "mut"}`}>
                      {e.status === "draft" ? "Brouillon" : "Archivé"}
                    </span>
                  </>
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
