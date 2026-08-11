"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { api, getToken } from "@/lib/api";

interface MyEvent {
  id: string;
  title: string;
  starts_at: string;
  status: string;
}

/**
 * Bouton « Proposer un sponsoring » d'une carte de l'annuaire : l'organisateur
 * choisit l'un de ses événements, ajoute un mot, et la plateforme contacte
 * l'entreprise sans jamais exposer son email.
 */
export function ProposeSponsorship({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loggedIn = typeof window !== "undefined" && Boolean(getToken());

  async function openForm() {
    setOpen(true);
    setError(null);
    try {
      const r = await api<{ events: MyEvent[] }>("/api/events");
      const list = r.events.filter((e) => e.status !== "archived");
      setEvents(list);
      if (list.length === 1) setEventId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${eventId}/sponsors/from-directory`, {
        method: "POST",
        body: { company_id: companyId, message: message.trim() || null },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <div className="alert ok" role="status" style={{ margin: 0 }}>Demande envoyée à {companyName} ✓</div>;
  }

  if (!open) {
    return loggedIn ? (
      <button
        type="button"
        className="btn-sm btn-accent"
        onClick={openForm}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}
      >
        <Send size={13} /> Proposer un sponsoring
      </button>
    ) : (
      <a className="btn btn-ghost btn-sm" href="/connexion" style={{ marginTop: 4 }}>
        Organisateur ? Connectez-vous pour proposer un sponsoring
      </a>
    );
  }

  return (
    <div style={{ borderTop: "1px dashed var(--line)", paddingTop: 10, marginTop: 4 }}>
      {events === null ? (
        <p className="muted" style={{ margin: 0 }}>Chargement de vos événements…</p>
      ) : events.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Créez d&apos;abord un événement pour proposer un sponsoring.
        </p>
      ) : (
        <>
          <label style={{ marginTop: 0 }}>Pour quel événement ?</label>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">—</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          <label>Un mot pour {companyName} (optionnel)</label>
          <textarea
            rows={2}
            maxLength={800}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Pourquoi ce partenariat a du sens…"
          />
          {error && <div className="alert err" role="alert">{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-sm btn-accent" disabled={busy || !eventId} onClick={send}>
              {busy ? "Envoi…" : "Envoyer la demande"}
            </button>
            <button type="button" className="btn-sm btn-ghost" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </>
      )}
    </div>
  );
}
