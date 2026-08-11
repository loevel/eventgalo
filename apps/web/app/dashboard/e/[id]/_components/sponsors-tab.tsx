"use client";

import React, { useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { API_BASE, api, formatDate, formatPrice } from "@/lib/api";
import { RatingForm, Stars } from "@/components/star-rating";
import { parsePerks } from "@/lib/perks";
import { WEB } from "./shared";
import { CopyField } from "./shared-cards";

export function SponsorsTab({
  ev, tiers, sponsors, act,
}: {
  ev: Record<string, any>;
  tiers: Array<Record<string, any>>;
  sponsors: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [tierForm, setTierForm] = useState({ name: "", price: "", quantity: "1", description: "", perks: "", rank: "0", showcase: "logo" });
  const [editingTier, setEditingTier] = useState<Record<string, string> | null>(null);
  const [invite, setInvite] = useState({ email: "", company: "", contact: "" });

  // L'évaluation d'un sponsor n'est possible qu'après l'événement.
  const eventEnd = (ev.ends_at as string | null) ?? (ev.starts_at as string | null);
  const eventPast = Boolean(eventEnd) && new Date(String(eventEnd)).getTime() < Date.now();

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    invited: { label: "Invité", cls: "mut" },
    pending: { label: "Engagé — à confirmer", cls: "warn" },
    confirmed: { label: "Confirmé", cls: "ok" },
    declined: { label: "Refusé", cls: "err" },
  };

  const tierPayload = (f: Record<string, string>) => ({
    name: f.name,
    description: f.description || null,
    price_cents: Math.round(Number(f.price || 0) * 100),
    quantity: Math.max(1, Number(f.quantity || 1)),
    perks: f.perks.split("\n").map((p) => p.trim()).filter(Boolean),
    rank: Math.max(0, Number(f.rank || 0)),
    showcase: f.showcase,
  });

  const SHOWCASE_LABEL: Record<string, string> = {
    logo: "Logo seul",
    standard: "Intermédiaire (logo + présentation + liens)",
    full: "Complète (photos, vidéo, contacts, réseaux)",
  };

  const showcaseSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(SHOWCASE_LABEL).map(([k, lbl]) => (
        <option key={k} value={k}>{lbl}</option>
      ))}
    </select>
  );

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Paliers de sponsoring</h3>
        <p className="muted">
          Définissez vos offres (ex. Sponsor officiel, Or, Argent) : montant, nombre de places et avantages offerts
          (logo sur scène, kakémono, billets VIP inclus, mention au micro…). Le rang 0 est le palier le plus
          prestigieux, affiché en premier et en plus grand sur la page publique.
        </p>
        {tiers.length === 0 && (
          <div className="alert info">
            Tant qu&apos;aucun palier n&apos;est créé, votre événement n&apos;apparaît pas dans les{" "}
            <a href="/opportunites" target="_blank" rel="noreferrer">événements à sponsoriser</a> et les
            entreprises ne peuvent pas vous faire de propositions. Créez votre premier palier ci-dessous.
          </div>
        )}
        {tiers.length > 0 && (() => {
          const minRank = Math.min(...tiers.map((t) => Number(t.rank)));
          return (
            <div className="tier-cards">
              {tiers.map((t) => {
                const engaged = sponsors.filter((s) => s.tier_id === t.id && ["pending", "confirmed"].includes(s.status)).length;
                if (editingTier && editingTier.id === t.id) {
                  return (
                    <div key={t.id} className="card tier-card tier-card-editing">
                      <label style={{ marginTop: 0 }}>Nom</label>
                      <input value={editingTier.name} onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })} />
                      <div className="grid2">
                        <div>
                          <label>Montant (CAD)</label>
                          <input type="number" min={0} step="0.01" value={editingTier.price} onChange={(e) => setEditingTier({ ...editingTier, price: e.target.value })} />
                        </div>
                        <div>
                          <label>Places</label>
                          <input type="number" min={1} value={editingTier.quantity} onChange={(e) => setEditingTier({ ...editingTier, quantity: e.target.value })} />
                        </div>
                      </div>
                      <label>Rang d&apos;affichage (0 = principal)</label>
                      <input type="number" min={0} value={editingTier.rank} onChange={(e) => setEditingTier({ ...editingTier, rank: e.target.value })} />
                      <label>Description courte</label>
                      <input value={editingTier.description} onChange={(e) => setEditingTier({ ...editingTier, description: e.target.value })} />
                      <label>Niveau de vitrine sur la page publique</label>
                      {showcaseSelect(editingTier.showcase, (v) => setEditingTier({ ...editingTier, showcase: v }))}
                      <label>Avantages offerts (un par ligne)</label>
                      <textarea rows={4} value={editingTier.perks} onChange={(e) => setEditingTier({ ...editingTier, perks: e.target.value })} />
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button
                          className="btn-sm btn-accent"
                          onClick={() => {
                            act(
                              () => api(`/api/events/${ev.id}/sponsor-tiers/${t.id}`, { method: "PATCH", body: tierPayload(editingTier) }),
                              "Palier modifié",
                            );
                            setEditingTier(null);
                          }}
                        >
                          Enregistrer
                        </button>
                        <button className="btn-sm btn-ghost" onClick={() => setEditingTier(null)}>Annuler</button>
                      </div>
                    </div>
                  );
                }
                const isPrimary = Number(t.rank) === minRank;
                const perks = parsePerks(t.perks);
                return (
                  <div key={t.id} className={`card tier-card${isPrimary ? " tier-card-primary" : ""}`}>
                    {isPrimary && <span className="badge warn tier-card-badge">Palier principal</span>}
                    <h4 className="tier-card-name">{t.name}</h4>
                    <div className="tier-card-price">{formatPrice(t.price_cents, t.currency)}</div>
                    <p className="muted" style={{ fontSize: 13, margin: "2px 0 12px" }}>
                      {engaged}/{t.quantity} place{t.quantity > 1 ? "s" : ""} engagée{engaged > 1 ? "s" : ""}
                    </p>
                    {perks.length > 0 && (
                      <ul className="tier-card-perks">
                        {perks.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    )}
                    <div className="tier-card-actions">
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() =>
                          setEditingTier({
                            id: t.id,
                            name: t.name,
                            price: String(t.price_cents / 100),
                            quantity: String(t.quantity),
                            rank: String(t.rank),
                            description: t.description ?? "",
                            perks: perks.join("\n"),
                            showcase: t.showcase ?? "logo",
                          })
                        }
                      >
                        Modifier
                      </button>
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() => {
                          if (confirm(`Supprimer le palier « ${t.name} » ?`)) {
                            act(() => api(`/api/events/${ev.id}/sponsor-tiers/${t.id}`, { method: "DELETE" }), "Palier supprimé");
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
        <h4 style={{ marginBottom: 4 }}>Ajouter un palier</h4>
        <div className="grid2">
          <div>
            <label>Nom</label>
            <input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Sponsor officiel" />
          </div>
          <div>
            <label>Montant (CAD)</label>
            <input type="number" min={0} step="0.01" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
          </div>
        </div>
        <div className="grid2">
          <div>
            <label>Nombre de places</label>
            <input type="number" min={1} value={tierForm.quantity} onChange={(e) => setTierForm({ ...tierForm, quantity: e.target.value })} />
          </div>
          <div>
            <label>Rang d&apos;affichage (0 = principal)</label>
            <input type="number" min={0} value={tierForm.rank} onChange={(e) => setTierForm({ ...tierForm, rank: e.target.value })} />
          </div>
        </div>
        <label>Description courte (optionnel)</label>
        <input value={tierForm.description} onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })} placeholder="Visibilité maximale avant, pendant et après le gala" />
        <label>Niveau de vitrine sur la page publique</label>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Ce que le sponsor pourra afficher sur la page de l&apos;événement : un simple logo, une présentation avec
          liens, ou une vitrine complète avec photos et vidéo — un vrai argument de vente pour vos gros paliers.
        </p>
        {showcaseSelect(tierForm.showcase, (v) => setTierForm({ ...tierForm, showcase: v }))}
        <label>Avantages offerts (un par ligne)</label>
        <textarea
          rows={4}
          value={tierForm.perks}
          onChange={(e) => setTierForm({ ...tierForm, perks: e.target.value })}
          placeholder={"Logo en grand sur la scène et la page de l'événement\n4 billets VIP offerts\nMention au micro pendant la soirée"}
        />
        <button
          className="btn-accent"
          disabled={!tierForm.name}
          onClick={() => {
            act(() => api(`/api/events/${ev.id}/sponsor-tiers`, { method: "POST", body: tierPayload(tierForm) }), "Palier créé");
            setTierForm({ name: "", price: "", quantity: "1", description: "", perks: "", rank: "0", showcase: "logo" });
          }}
        >
          Créer le palier
        </button>
      </div>

      {tiers.length > 0 && (() => {
        return (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Aperçu marketplace</h3>
            <p className="muted">
              Voici comment votre événement apparaît pour les entreprises qui cherchent un sponsoring.
            </p>
            <div className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {ev.logo_media_id && (
                  <img
                    src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file?thumb=1`}
                    alt=""
                    style={{ width: 58, height: 58, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 5, flex: "none" }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19 }}>
                    {ev.title}
                  </h3>
                  <p className="muted directory-meta" style={{ fontSize: 13 }}>
                    <span><CalendarDays size={13} /> {formatDate(ev.starts_at)}</span>
                    {ev.venue && <span><MapPin size={13} /> {ev.venue}</span>}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {tiers.map((t) => {
                  const engaged = sponsors.filter((s) => s.tier_id === t.id && ["pending", "confirmed"].includes(s.status)).length;
                  const remaining = t.quantity - engaged;
                  return (
                    <span key={t.id} className={`badge ${remaining > 0 ? "warn" : "mut"}`}>
                      {t.name} · {formatPrice(t.price_cents, t.currency)}
                      {remaining > 0 ? ` · ${remaining} place${remaining > 1 ? "s" : ""}` : " · complet"}
                    </span>
                  );
                })}
              </div>
            </div>
            <a href="/opportunites" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
              Voir la page publique des opportunités
            </a>
          </div>
        );
      })()}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Inviter un sponsor</h3>
        <p className="muted">
          L&apos;entreprise reçoit un lien privé où elle découvre vos paliers, choisit son offre, renseigne ses
          informations et téléverse son logo. Vous confirmez ensuite son sponsoring une fois le paiement reçu.
        </p>
        <DirectoryPicker eventId={ev.id} act={act} />
        <div className="grid2">
          <div>
            <label>Email du contact *</label>
            <input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="direction@entreprise.com" />
          </div>
          <div>
            <label>Entreprise (optionnel)</label>
            <input value={invite.company} onChange={(e) => setInvite({ ...invite, company: e.target.value })} />
          </div>
        </div>
        <label>Nom du contact (optionnel)</label>
        <input value={invite.contact} onChange={(e) => setInvite({ ...invite, contact: e.target.value })} />
        <button
          className="btn-accent"
          disabled={!invite.email}
          onClick={() => {
            act(
              () =>
                api(`/api/events/${ev.id}/sponsors`, {
                  method: "POST",
                  body: { contact_email: invite.email, company_name: invite.company || null, contact_name: invite.contact || null },
                }),
              "Invitation sponsor envoyée",
            );
            setInvite({ email: "", company: "", contact: "" });
          }}
        >
          Envoyer l&apos;invitation
        </button>
      </div>

      {sponsors.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Sponsors</h3>
          <table>
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Palier</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => {
                const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.invited;
                return (
                  <React.Fragment key={s.id}>
                    <tr>
                      <td>
                        {s.company_name ?? <span className="muted">—</span>}
                        {Boolean(s.company_verified) && (
                          <span className="badge ok" style={{ marginLeft: 6, fontSize: 11 }} title="Entreprise vérifiée (domaine ou registre)">
                            ✓ Vérifiée
                          </span>
                        )}
                        <span className="muted" style={{ display: "block", fontSize: 12 }}>
                          {s.contact_name ? `${s.contact_name} · ` : ""}{s.contact_email}
                        </span>
                      </td>
                      <td>{s.tier_name ?? <span className="muted">à choisir</span>}</td>
                      <td>
                        {s.amount_cents != null ? formatPrice(s.amount_cents, "CAD") : "—"}
                        {s.proposal_status === "pending" && (
                          <span className="badge warn" style={{ display: "block", marginTop: 4, fontSize: 11 }}>
                            Propose {formatPrice(s.proposed_cents ?? 0, "CAD")}
                          </span>
                        )}
                        {s.proposal_status === "accepted" && (
                          <span className="muted" style={{ display: "block", fontSize: 11 }}>montant négocié</span>
                        )}
                      </td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        {s.status === "pending" && (
                          <>
                            <button
                              className="btn-sm btn-accent"
                              onClick={() =>
                                act(
                                  () => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "PATCH", body: { status: "confirmed" } }),
                                  "Sponsor confirmé",
                                )
                              }
                            >
                              Confirmer
                            </button>{" "}
                            <button
                              className="btn-sm btn-ghost"
                              onClick={() =>
                                act(
                                  () => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "PATCH", body: { status: "declined" } }),
                                  "Sponsor refusé",
                                )
                              }
                            >
                              Refuser
                            </button>
                          </>
                        )}
                        {s.status === "confirmed" && (
                          <button
                            className="btn-sm btn-ghost"
                            onClick={() =>
                              act(
                                () => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "PATCH", body: { status: "pending" } }),
                                "Repassé en attente",
                              )
                            }
                          >
                            Repasser en attente
                          </button>
                        )}{" "}
                        <button
                          className="btn-sm btn-ghost"
                          onClick={() => {
                            if (confirm("Supprimer ce sponsor et son lien d'invitation ?")) {
                              act(() => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "DELETE" }), "Sponsor supprimé");
                            }
                          }}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                    {s.proposal_status === "pending" && (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 0 }}>
                          <div className="alert warn" role="alert" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "4px 0" }}>
                            <span style={{ flex: 1, minWidth: 220 }}>
                              <strong>Contre-proposition :</strong>{" "}
                              {formatPrice(s.proposed_cents ?? 0, "CAD")} au lieu de{" "}
                              {s.amount_cents != null ? formatPrice(s.amount_cents, "CAD") : "—"}
                              {s.proposed_message && (
                                <span className="muted" style={{ display: "block", fontSize: 13, fontStyle: "italic" }}>
                                  « {s.proposed_message} »
                                </span>
                              )}
                            </span>
                            <span style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn-sm btn-accent"
                                onClick={() =>
                                  act(
                                    () => api(`/api/events/${ev.id}/sponsors/${s.id}/proposal`, { method: "POST", body: { action: "accept" } }),
                                    "Montant négocié accepté",
                                  )
                                }
                              >
                                Accepter
                              </button>
                              <button
                                className="btn-sm btn-ghost"
                                onClick={() =>
                                  act(
                                    () => api(`/api/events/${ev.id}/sponsors/${s.id}/proposal`, { method: "POST", body: { action: "reject" } }),
                                    "Contre-proposition refusée",
                                  )
                                }
                              >
                                Refuser
                              </button>
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {s.status === "confirmed" && eventPast && (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 0 }}>
                          <RateSponsorInline eventId={ev.id} sponsor={s} act={act} />
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} style={{ paddingTop: 0 }}>
                        <CopyField value={`${WEB}/sp/${s.token}`} />
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Évaluation d'un sponsor confirmé après l'événement (note 1–5 + commentaire). */
export function RateSponsorInline({
  eventId, sponsor, act,
}: {
  eventId: string;
  sponsor: Record<string, any>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = (rating: number, comment: string) => {
    setBusy(true);
    act(
      () =>
        api(`/api/events/${eventId}/sponsors/${sponsor.id}/review`, {
          method: "POST",
          body: { rating, comment: comment || null },
        }).finally(() => {
          setBusy(false);
          setOpen(false);
        }),
      "Évaluation enregistrée",
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "2px 0 6px" }}>
      {sponsor.my_rating != null && !open && <Stars value={Number(sponsor.my_rating)} />}
      {sponsor.company_rating != null && (
        <span className="muted" style={{ fontSize: 12 }}>
          L&apos;entreprise vous a noté {sponsor.company_rating}/5
        </span>
      )}
      {!open ? (
        <button className="btn-sm btn-ghost" onClick={() => setOpen(true)}>
          {sponsor.my_rating != null ? "Modifier ma note" : "⭐ Évaluer ce sponsor"}
        </button>
      ) : (
        <div style={{ flexBasis: "100%", maxWidth: 420 }}>
          <RatingForm
            initialRating={sponsor.my_rating}
            initialComment={sponsor.my_comment}
            busy={busy}
            onSubmit={submit}
            label="Enregistrer ma note"
          />
          <button className="btn-sm btn-ghost" disabled={busy} onClick={() => setOpen(false)} style={{ marginTop: 6 }}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

/** Recherche dans l'annuaire public et envoi de demandes de sponsoring en un clic. */
export function DirectoryPicker({
  eventId, act,
}: {
  eventId: string;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<Array<Record<string, any>> | null>(null);
  const [searching, setSearching] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function generateMessage(companyName?: string) {
    setAiBusy(true);
    try {
      const res = await api<{ text: string }>(`/api/events/${eventId}/ai/draft`, {
        method: "POST",
        body: { target: "sponsor_pitch", hint: message, companyName },
      });
      setMessage(res.text);
    } catch {
      // Échec silencieux : le champ reste tel quel, l'organisateur peut réessayer.
    } finally {
      setAiBusy(false);
    }
  }

  async function search() {
    setSearching(true);
    try {
      const r = await api<{ companies: Array<Record<string, any>> }>(
        `/api/public/companies?q=${encodeURIComponent(q)}`,
        { auth: false },
      );
      setResults(r.companies);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  if (!open) {
    return (
      <p style={{ margin: "0 0 14px" }}>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setOpen(true);
            search();
          }}
        >
          🔎 Inviter depuis l&apos;annuaire des sponsors
        </button>
      </p>
    );
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div className="copy-row">
        <input
          placeholder="Rechercher une entreprise…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn-sm btn-accent" disabled={searching} onClick={search}>
          {searching ? "…" : "Chercher"}
        </button>
        <button type="button" className="btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
      {results !== null && results.length === 0 && (
        <p className="muted" style={{ margin: "10px 0 0" }}>
          Aucune entreprise trouvée dans l&apos;annuaire.{" "}
          <a href="/sponsors" target="_blank" rel="noreferrer">Voir l&apos;annuaire</a>
        </p>
      )}
      {results !== null && results.length > 0 && (
        <>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <label style={{ margin: 0 }}>Un mot pour l&apos;entreprise (optionnel, commun aux demandes)</label>
            <button type="button" className="btn-ghost btn-sm" disabled={aiBusy} onClick={() => generateMessage()}>
              {aiBusy ? "Rédaction…" : "✨ Générer avec l'IA"}
            </button>
          </div>
          <textarea
            rows={2}
            maxLength={800}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Pourquoi ce partenariat a du sens…"
          />
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {results.slice(0, 8).map((co) => (
              <div
                key={co.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong>{co.name}</strong>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>
                    {[co.sector, co.city].filter(Boolean).join(" · ") || "—"}
                    {co.sponsorships > 0 ? ` · ${co.sponsorships} sponsoring${co.sponsorships > 1 ? "s" : ""}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-sm btn-accent"
                  onClick={() =>
                    act(
                      () =>
                        api(`/api/events/${eventId}/sponsors/from-directory`, {
                          method: "POST",
                          body: { company_id: co.id, message: message.trim() || null },
                        }),
                      `Demande envoyée à ${co.name}`,
                    )
                  }
                >
                  Proposer
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
