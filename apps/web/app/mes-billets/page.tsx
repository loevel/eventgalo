"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Ticket, Mail, ArrowRight } from "lucide-react";
import { API_BASE, api, formatDate, getToken } from "@/lib/api";
import { TurnstileWidget } from "@/components/turnstile-widget";

interface MyTicket {
  serial: string;
  status: string;
  category_name: string;
  event_title: string;
  starts_at: string;
  venue: string | null;
  public_slug: string;
  logo_media_id: string | null;
}

interface MyInvitation {
  token: string;
  rsvp_status: string;
  event_title: string;
  starts_at: string;
  venue: string | null;
  logo_media_id: string | null;
}

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  valid: { text: "Valide", cls: "ok" },
  used: { text: "Utilisé", cls: "mut" },
  refunded: { text: "Remboursé", cls: "err" },
  void: { text: "Annulé", cls: "err" },
};

export default function MesBillets() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<{ upcoming: MyTicket[]; past: MyTicket[] } | null>(null);
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, i] = await Promise.all([
        api<{ upcoming: MyTicket[]; past: MyTicket[] }>("/api/me/tickets"),
        api<{ invitations: MyInvitation[] }>("/api/me/invitations"),
      ]);
      setTickets(t);
      setInvitations(i.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  useEffect(() => {
    const has = Boolean(getToken());
    setConnected(has);
    if (has) load();
  }, [load]);

  if (connected === null) return <main className="container narrow" />;
  if (!connected) return <SignInPrompt />;

  return (
    <main className="container">
      <header className="listing-head">
        <h1>Mes billets</h1>
        <p className="muted">
          Tous les billets et invitations liés à <strong>votre adresse email</strong>. Un billet acheté avec une autre
          adresse n&apos;apparaît pas ici — connectez-vous avec celle-là pour le retrouver.
        </p>
      </header>

      {error && (
        <div className="alert err" role="alert">
          {error}
        </div>
      )}

      {tickets && tickets.upcoming.length === 0 && tickets.past.length === 0 && invitations.length === 0 && (
        <div className="card empty-state">
          <Ticket size={28} aria-hidden="true" />
          <h2>Aucun billet pour l&apos;instant</h2>
          <p className="muted">
            Vos billets apparaîtront ici dès votre premier achat. En attendant, allez voir ce qui se prépare.
          </p>
          <Link className="btn-accent" href="/evenements">
            Découvrir les événements <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {invitations.length > 0 && (
        <section className="section">
          <h2 className="listing-title">Mes invitations</h2>
          <div className="card-grid">
            {invitations.map((inv) => (
              <Link key={inv.token} className="ev-card" href={`/i/${inv.token}`}>
                <EventThumb logoId={inv.logo_media_id} title={inv.event_title} />
                <div className="ev-card-body">
                  <h3>{inv.event_title}</h3>
                  <p className="ev-meta">
                    <CalendarDays size={14} aria-hidden="true" /> {formatDate(inv.starts_at)}
                  </p>
                  {inv.venue && (
                    <p className="ev-meta">
                      <MapPin size={14} aria-hidden="true" /> {inv.venue}
                    </p>
                  )}
                  <span className={`badge ${inv.rsvp_status === "yes" ? "ok" : inv.rsvp_status === "no" ? "err" : "mut"}`}>
                    {inv.rsvp_status === "yes" ? "Présence confirmée" : inv.rsvp_status === "no" ? "Décliné" : "Réponse attendue"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {tickets && tickets.upcoming.length > 0 && (
        <TicketSection title="À venir" tickets={tickets.upcoming} />
      )}
      {tickets && tickets.past.length > 0 && <TicketSection title="Passés" tickets={tickets.past} muted />}
    </main>
  );
}

function TicketSection({ title, tickets, muted }: { title: string; tickets: MyTicket[]; muted?: boolean }) {
  return (
    <section className="section">
      <h2 className="listing-title">{title}</h2>
      <div className={`card-grid ${muted ? "is-past" : ""}`}>
        {tickets.map((t) => {
          const status = STATUS_LABELS[t.status] ?? { text: t.status, cls: "mut" };
          return (
            <Link key={t.serial} className="ev-card" href={`/t/${t.serial}`}>
              <EventThumb logoId={t.logo_media_id} title={t.event_title} />
              <div className="ev-card-body">
                <h3>{t.event_title}</h3>
                <p className="ev-meta">
                  <CalendarDays size={14} aria-hidden="true" /> {formatDate(t.starts_at)}
                </p>
                {t.venue && (
                  <p className="ev-meta">
                    <MapPin size={14} aria-hidden="true" /> {t.venue}
                  </p>
                )}
                <div className="ev-card-foot">
                  <span className="ev-tag">{t.category_name}</span>
                  <span className={`badge ${status.cls}`}>{status.text}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function EventThumb({ logoId, title }: { logoId: string | null; title: string }) {
  if (!logoId) return <div className="ev-thumb ev-thumb-fallback" aria-hidden="true" />;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- vignette servie déjà redimensionnée par l'API */
    <img className="ev-thumb" src={`${API_BASE}/api/public/media/${logoId}/file?thumb=1`} alt={`Logo — ${title}`} />
  );
}

/**
 * Connexion sans mot de passe, sur place : demander à l'acheteur d'aller
 * ailleurs pour se connecter puis de revenir ferait perdre la moitié du monde
 * à cette étape. Le retour est mémorisé pour que le lien magique ramène ici.
 */
function SignInPrompt() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; text: string; url?: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem("eg_login_next", "/mes-billets");
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await api<{ message: string; debug_url?: string }>("/api/auth/magic-link", {
        method: "POST",
        body: { email, turnstile_token: turnstileToken },
        auth: false,
      });
      setStatus({ kind: res.debug_url ? "info" : "ok", text: res.message, url: res.debug_url });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container narrow">
      <section className="section login-section">
        <div className="card login-card">
          <Mail size={26} aria-hidden="true" style={{ color: "var(--accent)" }} />
          <h1 style={{ marginTop: 12 }}>Retrouver mes billets</h1>
          <p className="muted">
            Entrez l&apos;adresse utilisée lors de l&apos;achat : nous vous envoyons un lien de connexion. Pas de mot de
            passe à créer.
          </p>
          <form onSubmit={requestLink}>
            <label htmlFor="email">Votre email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
            />
            <TurnstileWidget onVerify={setTurnstileToken} />
            <button
              type="submit"
              className="btn-accent"
              disabled={busy || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}
            >
              {busy ? "Envoi…" : "Recevoir mon lien"}
            </button>
          </form>
          {status && (
            <div
              className={`alert ${status.kind === "err" ? "err" : status.kind === "ok" ? "ok" : "info"}`}
              role={status.kind === "err" ? "alert" : "status"}
            >
              {status.text}
              {status.url && (
                <p>
                  <a href={status.url}>→ Ouvrir le lien de connexion</a>
                </p>
              )}
            </div>
          )}
          <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>
            Vous avez le lien direct de votre billet dans votre email de confirmation ? Il fonctionne toujours, sans
            connexion.
          </p>
        </div>
      </section>
    </main>
  );
}
