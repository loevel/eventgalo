"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { CalendarDays, CalendarPlus, Check, MapPin, Printer, Shirt, Sparkles } from "lucide-react";
import { API_BASE, api, formatDate } from "@/lib/api";
import { parsePerks } from "@/lib/perks";
import { EventMiniCard, type SimilarEvent } from "@/components/similar-events";
import { cacheTicket, readCachedTicket, registerTicketWorker } from "@/lib/ticket-cache";

export default function TicketPage() {
  const { serial } = useParams<{ serial: string }>();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Billet servi depuis le cache local : le réseau n'a pas répondu. */
  const [offline, setOffline] = useState(false);
  const [refund, setRefund] = useState({ open: false, email: "", reason: "", done: false, err: "" });
  const [transfer, setTransfer] = useState({ open: false, email: "", newName: "", newEmail: "", done: false, err: "", busy: false });
  const [similar, setSimilar] = useState<SimilarEvent[]>([]);

  useEffect(() => {
    registerTicketWorker();

    /** Affiche un billet et en dérive le QR. Même chemin en ligne et hors ligne. */
    async function show(d: any) {
      setData(d);
      setQr(await QRCode.toDataURL(d.qr_payload, { width: 480, margin: 1 }));
    }

    api(`/api/public/tickets/${serial}`, { auth: false })
      .then(async (d: any) => {
        setOffline(false);
        // Conservé avant tout affichage : si la personne ferme la page ici, le
        // billet est déjà disponible pour l'entrée de la salle.
        cacheTicket(serial, d);
        await show(d);
        // Le détenteur d'un billet est déjà convaincu par le format : c'est le
        // meilleur moment pour lui montrer la suite. La page était un cul-de-sac.
        if (d.ticket?.public_slug) {
          api<{ events: SimilarEvent[] }>(`/api/public/events/${d.ticket.public_slug}/similar`, { auth: false })
            .then((r) => setSimilar(r.events))
            .catch(() => {
              // Suggestions optionnelles : le billet reste la priorité de la page.
            });
        }
      })
      .catch(async (e) => {
        // Le réseau a échoué : on ressort la dernière copie connue plutôt que
        // de laisser quelqu'un devant une erreur à l'entrée de la salle.
        const cached = readCachedTicket(serial);
        if (cached) {
          setOffline(true);
          await show(cached);
        } else {
          setError(e.message);
        }
      });
  }, [serial]);

  if (error) return <main className="container narrow"><div className="alert err" role="alert">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const t = data.ticket;
  const perks = parsePerks(t.category_perks);
  return (
    <main className="container narrow">
      {offline && (
        // On ne prétend pas que le billet est valide : on dit d'où il vient.
        // Le statut affiché date de la dernière connexion, et un contrôleur qui
        // scanne le QR obtiendra de toute façon la vérité côté serveur.
        <div className="alert warn no-print" role="status" style={{ marginBottom: 16 }}>
          <strong>Mode hors ligne.</strong> Ce billet est affiché depuis une copie enregistrée sur cet appareil. Le QR
          code reste valable au contrôle ; les informations peuvent dater de votre dernière connexion.
        </div>
      )}
      <div className="ticket-shell">
        <div className="ticket-head">
          {t.logo_media_id ? (
            <img
              className="ticket-logo"
              src={`${API_BASE}/api/public/media/${t.logo_media_id}/file?thumb=1`}
              alt={`Logo — ${t.event_title}`}
            />
          ) : (
            <span className="ticket-brand">
              Event<em>Galo</em>
            </span>
          )}
          <h2 className="ticket-title">{t.event_title}</h2>
          <div className="ticket-meta">
            <span>
              <CalendarDays /> {formatDate(t.starts_at)}
            </span>
            {t.venue && (
              <span>
                <MapPin /> {t.venue}
                {t.address ? `, ${t.address}` : ""}
              </span>
            )}
            {t.dress_code && (
              <span>
                <Shirt /> {t.dress_code}
              </span>
            )}
          </div>
          <div className="ticket-badges">
            <span className="ticket-cat">{t.category_name}</span>
            <span className={`badge ${t.status === "valid" ? "ok" : t.status === "used" ? "mut" : "err"}`}>
              {t.status === "valid" ? "Valide" : t.status === "used" ? "Déjà utilisé" : "Remboursé/annulé"}
            </span>
          </div>
        </div>

        <div className="ticket-perf" aria-hidden="true" />

        <div className="ticket-body">
          {qr && t.status === "valid" && (
            <div className="ticket-qr-frame">
              <img src={qr} alt={`QR code du billet ${t.serial}`} />
            </div>
          )}
          <div className="serial">{t.serial}</div>
          <p className="ticket-holder">{t.buyer_name}</p>

          {perks.length > 0 && (
            <div className="ticket-perks">
              <h3>
                <Sparkles /> Inclus avec votre billet {t.category_name}
              </h3>
              <ul>
                {perks.map((p, i) => (
                  <li key={i} style={{ animationDelay: `${0.55 + i * 0.09}s` }}>
                    <Check /> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="muted ticket-note">
            Billet nominatif à usage unique. Présentez ce QR code à l&apos;entrée.
          </p>
          <div className="ticket-actions no-print">
            <button className="btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} /> Imprimer / PDF
            </button>
            <a className="btn btn-ghost btn-sm" href={`${API_BASE}/api/public/tickets/${serial}/ics`}>
              <CalendarPlus size={15} /> Agenda
            </a>
          </div>
        </div>
      </div>

      {t.status === "valid" && (
        <div className="card no-print">
          {!transfer.open ? (
            <button className="btn-ghost btn-sm" onClick={() => setTransfer({ ...transfer, open: true })}>
              Transférer ce billet
            </button>
          ) : transfer.done ? (
            <div className="alert ok" role="status">Billet transféré. Le nouveau titulaire a reçu un email.</div>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Transférer ce billet</h3>
              <label>Votre email (utilisé lors de l&apos;achat)</label>
              <input type="email" value={transfer.email} onChange={(e) => setTransfer({ ...transfer, email: e.target.value })} />
              <label>Nom du nouveau titulaire</label>
              <input value={transfer.newName} onChange={(e) => setTransfer({ ...transfer, newName: e.target.value })} />
              <label>Email du nouveau titulaire</label>
              <input type="email" value={transfer.newEmail} onChange={(e) => setTransfer({ ...transfer, newEmail: e.target.value })} />
              {transfer.err && <div className="alert err" role="alert">{transfer.err}</div>}
              <button
                className="btn-accent"
                disabled={transfer.busy}
                onClick={() => {
                  setTransfer({ ...transfer, busy: true, err: "" });
                  api(`/api/public/tickets/${serial}/transfer`, {
                    method: "PATCH",
                    auth: false,
                    body: { email: transfer.email, new_name: transfer.newName, new_email: transfer.newEmail },
                  })
                    .then(() => setTransfer({ ...transfer, done: true, busy: false }))
                    .catch((e) => setTransfer({ ...transfer, err: e.message, busy: false }));
                }}
              >
                {transfer.busy ? "Transfert…" : "Confirmer le transfert"}
              </button>
            </>
          )}
        </div>
      )}

      {t.status === "valid" && (
        <div className="card no-print">
          {!refund.open ? (
            <button className="btn-ghost btn-sm" onClick={() => setRefund({ ...refund, open: true })}>
              Demander un remboursement
            </button>
          ) : refund.done ? (
            <div className="alert ok" role="status">Demande envoyée. L&apos;organisateur va l&apos;examiner.</div>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Demande de remboursement</h3>
              <label>Email utilisé lors de l&apos;achat</label>
              <input type="email" value={refund.email} onChange={(e) => setRefund({ ...refund, email: e.target.value })} />
              <label>Motif (optionnel)</label>
              <textarea rows={2} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
              {refund.err && <div className="alert err" role="alert">{refund.err}</div>}
              <button
                className="btn-accent"
                onClick={() =>
                  api(`/api/public/tickets/${serial}/refund-request`, {
                    method: "POST",
                    auth: false,
                    body: { email: refund.email, reason: refund.reason },
                  })
                    .then(() => setRefund({ ...refund, done: true }))
                    .catch((e) => setRefund({ ...refund, err: e.message }))
                }
              >
                Envoyer la demande
              </button>
            </>
          )}
        </div>
      )}

      {similar.length > 0 && (
        <section className="section similar-band no-print">
          <div className="similar-head">
            <h2>Après cet événement</h2>
            <a className="similar-all" href="/evenements">
              Tous les événements
            </a>
          </div>
          <div className="mini-grid">
            {similar.map((ev) => (
              <EventMiniCard key={ev.public_slug} ev={ev} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
