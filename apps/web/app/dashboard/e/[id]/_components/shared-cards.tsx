"use client";

import { useState } from "react";
import Link from "next/link";
import { API_BASE, api, formatDate, getToken } from "@/lib/api";

export function QuestionsCard({ questions, onEdit }: { questions: Array<Record<string, any>>; onEdit: () => void }) {
  const [showAll, setShowAll] = useState(false);
  if (questions.length === 0) return null;

  const unanswered = questions.filter((q) => !q.answered);
  const shown = showAll ? questions : unanswered.slice(0, 5);
  if (shown.length === 0 && !showAll) return null;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Ce que vos visiteurs demandent</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {unanswered.length > 0
          ? `${unanswered.length} question${unanswered.length > 1 ? "s" : ""} sans réponse : l'information manque à votre fiche.`
          : "L'assistant a su répondre à toutes les questions posées."}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {shown.map((q) => (
          <li key={q.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              {!q.answered && (
                <span
                  className="badge warn"
                  style={{ flex: "none", fontSize: 11 }}
                  title="L'assistant n'a pas trouvé l'information dans votre fiche"
                >
                  sans réponse
                </span>
              )}
              <span>{q.question}</span>
            </div>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {unanswered.length > 0 && (
          <button type="button" className="btn-sm btn-accent" onClick={onEdit}>
            Compléter ma fiche
          </button>
        )}
        <button type="button" className="btn-sm btn-ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Voir seulement les sans-réponse" : `Voir les ${questions.length} questions`}
        </button>
      </div>
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn-sm btn-ghost"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓" : "Copier"}
      </button>
    </div>
  );
}

export function CollaboratorsCard({
  ev, isOwner, collaborators, act,
}: {
  ev: Record<string, any>;
  isOwner: boolean;
  collaborators: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [email, setEmail] = useState("");
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Organisateurs</h3>
      <p className="muted">Les co-organisateurs ont un accès complet à cet événement (invités, billetterie, annonces…).</p>
      {collaborators.length > 0 && (
        <ul style={{ paddingLeft: 20 }}>
          {collaborators.map((cb) => (
            <li key={cb.id} style={{ marginBottom: 4 }}>
              {cb.name || cb.email}{" "}
              {isOwner && (
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => act(() => api(`/api/events/${ev.id}/collaborators/${cb.id}`, { method: "DELETE" }), "Co-organisateur retiré")}
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner ? (
        <div className="copy-row">
          <input
            type="email"
            placeholder="email@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn-sm btn-accent"
            disabled={!email}
            onClick={() => {
              act(() => api(`/api/events/${ev.id}/collaborators`, { method: "POST", body: { email } }), "Co-organisateur ajouté");
              setEmail("");
            }}
          >
            Ajouter
          </button>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Seul l&apos;organisateur principal peut gérer les co-organisateurs.</p>
      )}
    </div>
  );
}

export function DetailsCard({ ev }: { ev: Record<string, any> }) {
  const agenda: Array<{ time: string; label: string }> = (() => {
    try {
      return ev.agenda ? JSON.parse(ev.agenda) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ marginTop: 0 }}>Détails</h3>
        <Link href={`/dashboard/e/${ev.id}/edit`} className="btn-sm btn-ghost">Modifier</Link>
      </div>
      <p className="muted">
        {ev.description || "Pas de description."}
        {ev.dress_code ? ` · Dress code : ${ev.dress_code}` : ""}
      </p>
      {agenda.length > 0 && (
        <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
          {agenda.map((item, i) => (
            <li key={i} className="muted" style={{ fontSize: 13, padding: "3px 0" }}>
              <strong style={{ color: "var(--ink)" }}>{item.time}</strong> — {item.label}
            </li>
          ))}
        </ul>
      )}
      <a
        className="btn btn-ghost btn-sm"
        href={`${API_BASE}/api/events/${ev.id}/export`}
        onClick={(e) => {
          e.preventDefault();
          fetch(`${API_BASE}/api/events/${ev.id}/export`, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then((r) => r.blob())
            .then((b) => {
              const url = URL.createObjectURL(b);
              const a = document.createElement("a");
              a.href = url;
              a.download = `eventgalo-export-${ev.public_slug}.json`;
              a.click();
            });
        }}
      >
        ⬇ Exporter les données (JSON)
      </a>
    </div>
  );
}

/**
 * Une annonce publiée, avec l'état de sa diffusion par courriel. Le renvoi sert
 * quand des billets ont été vendus après coup, ou qu'un envoi a échoué.
 */
export function AnnouncementCard({
  eventId, announcement, act,
}: {
  eventId: string;
  announcement: Record<string, any>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [resent, setResent] = useState<number | null>(null);
  const count = Number(announcement.recipients_count ?? 0);
  const notified = Boolean(announcement.notified_at);

  return (
    <div className="card">
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{announcement.body}</p>
      <span className="muted">
        {formatDate(announcement.created_at)}
        {" · "}
        {resent !== null
          ? `courriel renvoyé à ${resent} personne${resent > 1 ? "s" : ""}`
          : announcement.notify === 0
            ? "publiée sans courriel"
            : notified
              ? count > 0
                ? `courriel envoyé à ${count} personne${count > 1 ? "s" : ""}`
                : "aucun destinataire avec adresse courriel"
              : "diffusion non confirmée"}
      </span>
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn-sm btn-ghost"
          onClick={() =>
            act(async () => {
              const res = await api<{ notified: number }>(
                `/api/events/${eventId}/announcements/${announcement.id}/notify`,
                { method: "POST" },
              );
              setResent(res.notified);
            }, "Courriel renvoyé")
          }
        >
          ✉ Renvoyer par courriel
        </button>
      </div>
    </div>
  );
}

export function AnnounceForm({ eventId, act }: { eventId: string; act: (fn: () => Promise<unknown>, ok?: string) => void }) {
  const [body, setBody] = useState("");
  const [hint, setHint] = useState("");
  const [notify, setNotify] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);

  async function generate() {
    setAiBusy(true);
    try {
      const res = await api<{ text: string }>(`/api/events/${eventId}/ai/draft`, {
        method: "POST",
        body: { target: "announcement", hint },
      });
      setBody(res.text);
    } catch {
      // L'erreur s'affiche déjà via le flux act() ailleurs ; ici on échoue silencieusement.
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Nouvelle annonce</h3>
      <p className="muted">
        Visible sur la page de l&apos;événement et sur toutes les invitations, et envoyée par courriel aux invités
        (hors refus) ainsi qu&apos;aux détenteurs de billets.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="De quoi parle l'annonce ? (ex. changement d'horaire)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-sm btn-ghost" onClick={generate} disabled={aiBusy}>
          {aiBusy ? "Génération…" : "✨ Générer avec l'IA"}
        </button>
      </div>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Changement d'horaire : ouverture des portes à 19h." />
      <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 12px" }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <span>Prévenir les invités et les détenteurs de billets par courriel</span>
      </label>
      <button
        className="btn-accent"
        onClick={() => {
          if (body.trim()) {
            act(
              () => api(`/api/events/${eventId}/announcements`, { method: "POST", body: { body, notify } }),
              notify ? "Annonce publiée et courriel en cours d'envoi" : "Annonce publiée",
            );
            setBody("");
          }
        }}
      >
        Publier
      </button>
    </div>
  );
}
