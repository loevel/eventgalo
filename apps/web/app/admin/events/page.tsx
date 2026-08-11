"use client";

import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";

interface AdminEvent {
  id: string;
  title: string;
  status: string;
  type: string;
  starts_at: string;
  capacity: number;
  public_slug: string;
  organizer_id: string;
  organizer_email: string;
  organizer_name: string | null;
  tickets_sold: number;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "mut" },
  published: { label: "Publié", cls: "ok" },
  archived: { label: "Archivé", cls: "warn" },
};

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load(query = "", statusFilter = "") {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter) params.set("status", statusFilter);
    api<{ events: AdminEvent[] }>(`/api/admin/events?${params}`)
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message));
  }

  useEffect(() => load(), []);

  async function setEventStatus(ev: AdminEvent, next: string) {
    if (next === "archived" && !confirm(`Archiver « ${ev.title} » ? La page publique ne sera plus accessible.`)) return;
    setBusy(ev.id);
    try {
      await api(`/api/admin/events/${ev.id}/status`, { method: "POST", body: { status: next } });
      load(q, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function deleteEvent(ev: AdminEvent) {
    if (!confirm(`Supprimer définitivement « ${ev.title} » ? Cette action est irréversible.`)) return;
    setBusy(ev.id);
    setError(null);
    try {
      await api(`/api/admin/events/${ev.id}`, { method: "DELETE" });
      load(q, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q, status);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 14 }}
      >
        <input
          placeholder="Rechercher par titre ou organisateur…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="published">Publié</option>
          <option value="archived">Archivé</option>
        </select>
        <button type="submit" className="btn-sm btn-ghost">Rechercher</button>
      </form>
      {error && <div className="alert err" role="alert">{error}</div>}
      {!events ? (
        <p className="muted">Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Événement</th>
              <th>Organisateur</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Billets vendus</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const s = STATUS_LABEL[ev.status] ?? { label: ev.status, cls: "mut" };
              return (
                <tr key={ev.id}>
                  <td>
                    <a href={`/e/${ev.public_slug}`} target="_blank" rel="noreferrer">{ev.title}</a>
                  </td>
                  <td>
                    {ev.organizer_name ?? "—"}
                    <div className="muted" style={{ fontSize: 12 }}>{ev.organizer_email}</div>
                  </td>
                  <td>{formatDate(ev.starts_at)}</td>
                  <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                  <td>{ev.tickets_sold}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {ev.status !== "published" && (
                      <button className="btn-sm btn-ghost" disabled={busy === ev.id} onClick={() => setEventStatus(ev, "published")}>
                        Publier
                      </button>
                    )}
                    {ev.status !== "archived" && (
                      <button className="btn-sm btn-ghost" disabled={busy === ev.id} onClick={() => setEventStatus(ev, "archived")}>
                        Archiver
                      </button>
                    )}
                    <button className="btn-sm btn-ghost" disabled={busy === ev.id} onClick={() => deleteEvent(ev)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Aucun événement trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
