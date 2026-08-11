"use client";

import { useState } from "react";
import { Check, Handshake } from "lucide-react";
import { api, formatPrice, getToken } from "@/lib/api";
import { parsePerks } from "@/lib/perks";

interface OpportunityTier {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number;
  taken: number;
  perks: string | null;
}

/**
 * Candidature spontanée d'une entreprise sur un événement : choix du palier,
 * mot à l'organisation, puis engagement direct (l'organisateur confirme).
 */
export function ApplySponsorship({ eventId, eventTitle, tiers }: { eventId: string; eventTitle: string; tiers: OpportunityTier[] }) {
  const [open, setOpen] = useState(false);
  const [tierId, setTierId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneToken, setDoneToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loggedIn = typeof window !== "undefined" && Boolean(getToken());

  if (doneToken) {
    return (
      <div className="alert ok" role="status" style={{ margin: 0 }}>
        <strong>Candidature envoyée !</strong> L&apos;organisation de {eventTitle} va l&apos;examiner.{" "}
        <a href={`/sp/${doneToken}`}>Suivre ma candidature (et payer en ligne)</a>
      </div>
    );
  }

  if (!open) {
    return loggedIn ? (
      <button
        type="button"
        className="btn-sm btn-accent"
        onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Handshake size={14} /> Me proposer comme sponsor
      </button>
    ) : (
      <a className="btn btn-ghost btn-sm" href="/connexion" style={{ marginTop: 0 }}>
        Connectez-vous pour vous proposer comme sponsor
      </a>
    );
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string }>("/api/company/apply", {
        method: "POST",
        body: { event_id: eventId, tier_id: tierId, message: message.trim() || null },
      });
      setDoneToken(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: "1px dashed var(--line)", paddingTop: 12, width: "100%" }}>
      {tiers.map((t) => {
        const remaining = t.quantity - t.taken;
        const soldOut = remaining <= 0;
        const perks = parsePerks(t.perks);
        const selected = tierId === t.id;
        return (
          <div
            key={t.id}
            className={`cat-card ${selected ? "selected" : ""} ${soldOut ? "disabled" : ""}`}
            onClick={() => !soldOut && setTierId(t.id)}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
          >
            <div className="cat-card-head">
              <div>
                <div className="cat-name">{t.name}</div>
                <div className="cat-remaining">
                  {soldOut ? "Complet" : `${remaining} place${remaining > 1 ? "s" : ""} de sponsoring`}
                </div>
              </div>
              <div className="cat-price">{formatPrice(t.price_cents, t.currency)}</div>
            </div>
            {perks.length > 0 && (
              <ul className="cat-perks">
                {perks.map((p, i) => (
                  <li key={i}>
                    <Check /> {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <label>Un mot à l&apos;organisation (optionnel)</label>
      <textarea
        rows={2}
        maxLength={800}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Pourquoi votre entreprise veut soutenir cet événement…"
      />
      {error && (
        <div className="alert err" role="alert">
          {error}
          {error.includes("profil entreprise") && (
            <p style={{ margin: "6px 0 0" }}>
              <a href="/entreprise">→ Créer mon profil entreprise</a>
            </p>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn-sm btn-accent" disabled={busy || !tierId} onClick={apply}>
          {busy ? "Envoi…" : "Envoyer ma candidature"}
        </button>
        <button type="button" className="btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  );
}
