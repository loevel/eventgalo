"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, Building2, Check, CreditCard, Handshake, HandCoins, Hourglass, ImagePlus, Megaphone, Star, Trash2, Upload } from "lucide-react";
import { API_BASE, api, formatDate, formatPrice } from "@/lib/api";
import { parsePerks } from "@/lib/perks";
import { SOCIAL_KEYS, SOCIAL_LABELS, parseSocials, videoEmbedUrl, type SocialKey } from "@/lib/sponsor";
import { RatingForm } from "@/components/star-rating";

interface SponsorPayload {
  sponsor: {
    id: string;
    tier_id: string | null;
    company_name: string | null;
    website: string | null;
    logo_media_id: string | null;
    contact_name: string | null;
    message: string | null;
    status: "invited" | "pending" | "confirmed" | "declined";
    amount_cents: number | null;
    paid_at: string | null;
    description: string | null;
    address: string | null;
    phone: string | null;
    public_email: string | null;
    video_url: string | null;
    socials: string | null;
    proposed_cents: number | null;
    proposed_message: string | null;
    proposal_status: "pending" | "accepted" | "rejected" | null;
  };
  event: {
    title: string;
    description: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venue: string | null;
    public_slug: string;
    logo_media_id: string | null;
  };
  tiers: Array<{
    id: string;
    name: string;
    description: string | null;
    price_cents: number;
    currency: string;
    quantity: number;
    perks: string | null;
    rank: number;
    showcase: "logo" | "standard" | "full";
  }>;
  taken: Array<{ tier_id: string; n: number }>;
  photos: Array<{ id: string }>;
  my_review: { rating: number; comment: string | null } | null;
  event_past: boolean;
  stripe_enabled: boolean;
}

export default function SponsorPage() {
  const { token } = useParams<{ token: string }>();
  const [justPaid, setJustPaid] = useState(false);
  const [data, setData] = useState<SponsorPayload | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setJustPaid(new URLSearchParams(window.location.search).get("paid") === "1");
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [tierId, setTierId] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoId, setLogoId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Vitrine (profil public du sponsor)
  const [profile, setProfile] = useState({
    description: "", address: "", phone: "", public_email: "", website: "", video_url: "",
    socials: {} as Partial<Record<SocialKey, string>>,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<SponsorPayload>(`/api/public/sponsor/${token}`, { auth: false })
      .then((d) => {
        setData(d);
        setTierId(d.sponsor.tier_id ?? "");
        setCompany(d.sponsor.company_name ?? "");
        setWebsite(d.sponsor.website ?? "");
        setContact(d.sponsor.contact_name ?? "");
        setMessage(d.sponsor.message ?? "");
        setLogoId(d.sponsor.logo_media_id);
        setProfile({
          description: d.sponsor.description ?? "",
          address: d.sponsor.address ?? "",
          phone: d.sponsor.phone ?? "",
          public_email: d.sponsor.public_email ?? "",
          website: d.sponsor.website ?? "",
          video_url: d.sponsor.video_url ?? "",
          socials: parseSocials(d.sponsor.socials),
        });
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(load, [load]);

  // Retour de Stripe : le webhook confirme en arrière-plan, on re-vérifie quelques secondes.
  useEffect(() => {
    if (!justPaid || !data || data.sponsor.status !== "pending") return;
    const id = setInterval(load, 3000);
    const stop = setTimeout(() => clearInterval(id), 30_000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [justPaid, data, load]);

  async function payOnline() {
    setPaying(true);
    setError(null);
    try {
      const res = await api<{ checkout_url: string }>(`/api/public/sponsor/${token}/checkout`, {
        method: "POST",
        auth: false,
        body: {},
      });
      window.location.href = res.checkout_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setPaying(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ media_id: string }>(`/api/public/sponsor/${token}/logo`, {
        method: "POST",
        auth: false,
        body: fd,
      });
      setLogoId(res.media_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    setError(null);
    try {
      await api(`/api/public/sponsor/${token}/profile`, {
        method: "PATCH",
        auth: false,
        body: {
          description: profile.description || null,
          address: profile.address || null,
          phone: profile.phone || null,
          public_email: profile.public_email || null,
          website: profile.website || null,
          video_url: profile.video_url || null,
          socials: profile.socials,
        },
      });
      setProfileSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/public/sponsor/${token}/media`, { method: "POST", auth: false, body: fd });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPhotoUploading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  // Négociation du montant
  const [showPropose, setShowPropose] = useState(false);
  const [proposeAmount, setProposeAmount] = useState("");
  const [proposeMsg, setProposeMsg] = useState("");
  const [proposing, setProposing] = useState(false);

  async function sendProposal(e: React.FormEvent) {
    e.preventDefault();
    setProposing(true);
    setError(null);
    try {
      await api(`/api/public/sponsor/${token}/propose`, {
        method: "POST",
        auth: false,
        body: { amount_cents: Math.round(Number(proposeAmount) * 100), message: proposeMsg || null },
      });
      setShowPropose(false);
      setProposeAmount("");
      setProposeMsg("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setProposing(false);
    }
  }

  // Évaluation de l'organisation après l'événement
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  function sendReview(rating: number, comment: string) {
    setReviewBusy(true);
    setReviewSaved(false);
    setError(null);
    api(`/api/public/sponsor/${token}/review`, {
      method: "POST",
      auth: false,
      body: { rating, comment: comment || null },
    })
      .then(() => {
        setReviewSaved(true);
        load();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setReviewBusy(false));
  }

  async function commit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/public/sponsor/${token}`, {
        method: "POST",
        auth: false,
        body: { tier_id: tierId, company_name: company, website: website || null, contact_name: contact || null, message: message || null },
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <main className="container narrow"><div className="alert err" role="alert">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const { sponsor, event: ev, tiers } = data;
  const takenBy = (id: string) => data.taken.find((t) => t.tier_id === id)?.n ?? 0;
  const logoUrl = logoId ? `${API_BASE}/api/public/media/${logoId}/file?thumb=1` : null;
  const myTier = tiers.find((t) => t.id === sponsor.tier_id);
  const showcase = myTier?.showcase ?? "logo";
  const embed = videoEmbedUrl(profile.video_url);

  return (
    <>
      <div className="sponsor-hero">
        <div className="sponsor-hero-content">
          {ev.logo_media_id && (
            <img className="event-logo" src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file?thumb=1`} alt="" style={{ margin: "0 auto 14px" }} />
          )}
          <span className="hero-badge glass glass-chip">
            <Handshake /> Espace sponsor
          </span>
          <h1>{ev.title}</h1>
          <p>
            {formatDate(ev.starts_at)}
            {ev.venue ? ` · ${ev.venue}` : ""}
          </p>
        </div>
      </div>

      <main className="container narrow">
        {sponsor.status === "confirmed" && (
          <div className="card" style={{ textAlign: "center" }}>
            <BadgeCheck size={40} style={{ color: "var(--ok)" }} />
            <h2 style={{ margin: "8px 0 6px" }}>Merci pour votre soutien !</h2>
            <p className="muted">
              Le sponsoring de <strong>{sponsor.company_name}</strong> est confirmé
              {sponsor.paid_at ? " et payé en ligne" : ""}. Votre logo apparaît sur la page publique de
              l&apos;événement.
            </p>
            <a className="btn btn-accent" href={`/e/${ev.public_slug}`}>
              Voir la page de l&apos;événement
            </a>
          </div>
        )}

        {sponsor.status === "confirmed" && data.event_past && (
          <div className="card">
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Star size={17} /> Comment s&apos;est passé l&apos;événement ?
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Évaluez l&apos;organisation : votre note aide les autres entreprises de l&apos;annuaire à choisir
              leurs prochains sponsorings.
              {data.my_review ? " Vous pouvez modifier votre note à tout moment." : ""}
            </p>
            {reviewSaved && <div className="alert ok" role="status">Merci, votre évaluation est enregistrée ✓</div>}
            <RatingForm
              key={data.my_review ? `${data.my_review.rating}:${data.my_review.comment ?? ""}` : "new"}
              initialRating={data.my_review?.rating}
              initialComment={data.my_review?.comment}
              busy={reviewBusy}
              onSubmit={sendReview}
              label={data.my_review ? "Mettre à jour ma note" : "Envoyer mon évaluation"}
            />
          </div>
        )}

        {sponsor.status === "pending" && (
          <div className="card">
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Hourglass size={17} /> Engagement enregistré
            </h3>
            {justPaid && (
              <div className="alert info">
                Paiement en cours de confirmation… Cette page se mettra à jour automatiquement dans quelques
                secondes.
              </div>
            )}
            <p className="muted">
              Merci ! Votre engagement de{" "}
              <strong>{sponsor.amount_cents != null ? formatPrice(sponsor.amount_cents, tiers[0]?.currency ?? "CAD") : "—"}</strong>{" "}
              au nom de <strong>{sponsor.company_name}</strong> a été transmis à l&apos;organisation.
            </p>
            {sponsor.proposal_status === "pending" && (
              <div className="alert info">
                Votre contre-proposition de{" "}
                <strong>{formatPrice(sponsor.proposed_cents ?? 0, tiers[0]?.currency ?? "CAD")}</strong> est en
                cours d&apos;examen par l&apos;organisation — vous recevrez un email dès sa réponse.
              </div>
            )}
            {sponsor.proposal_status === "accepted" && (
              <div className="alert ok" role="status">
                Montant négocié accepté : votre sponsoring s&apos;élève maintenant à{" "}
                <strong>{formatPrice(sponsor.amount_cents ?? 0, tiers[0]?.currency ?? "CAD")}</strong>.
              </div>
            )}
            {sponsor.proposal_status === "rejected" && (
              <div className="alert info">
                L&apos;organisation a décliné votre contre-proposition
                {sponsor.proposed_cents != null
                  ? ` de ${formatPrice(sponsor.proposed_cents, tiers[0]?.currency ?? "CAD")}`
                  : ""}{" "}
                — le montant du palier reste{" "}
                <strong>{formatPrice(sponsor.amount_cents ?? 0, tiers[0]?.currency ?? "CAD")}</strong>. Vous
                pouvez le régler, proposer un autre montant ou décliner.
              </div>
            )}
            {data.stripe_enabled && (sponsor.amount_cents ?? 0) > 0 && !justPaid && sponsor.proposal_status !== "pending" ? (
              <>
                <button
                  className="btn-accent"
                  disabled={paying}
                  onClick={payOnline}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <CreditCard size={16} />
                  {paying
                    ? "Redirection…"
                    : `Payer ${formatPrice(sponsor.amount_cents ?? 0, tiers[0]?.currency ?? "CAD")} en ligne`}
                </button>
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                  Paiement sécurisé par carte via Stripe — votre sponsoring est confirmé immédiatement. Vous
                  préférez un virement ou une facture&nbsp;? L&apos;organisation vous contactera et confirmera
                  manuellement.
                </p>
              </>
            ) : (
              !justPaid && sponsor.proposal_status !== "pending" && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  L&apos;organisation vous contactera pour finaliser le paiement (virement ou facture). Votre logo
                  apparaîtra sur la page de l&apos;événement dès confirmation.
                </p>
              )
            )}
          </div>
        )}

        {sponsor.status === "pending" && !sponsor.paid_at && sponsor.proposal_status !== "pending" && !justPaid && (
          <div className="card">
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <HandCoins size={17} /> Proposer un autre montant
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Le montant du palier ne correspond pas à votre budget&nbsp;? Faites une contre-proposition :
              l&apos;organisation l&apos;accepte ou la refuse, et vous recevez sa réponse par email.
            </p>
            {!showPropose ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setShowPropose(true)}>
                Faire une contre-proposition
              </button>
            ) : (
              <form onSubmit={sendProposal}>
                <div className="grid2">
                  <div>
                    <label>Montant proposé (CAD) *</label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      required
                      value={proposeAmount}
                      onChange={(e) => setProposeAmount(e.target.value)}
                      placeholder={sponsor.amount_cents != null ? String(sponsor.amount_cents / 100) : ""}
                    />
                  </div>
                </div>
                <label>Message à l&apos;organisation (optionnel)</label>
                <textarea
                  rows={2}
                  maxLength={800}
                  value={proposeMsg}
                  onChange={(e) => setProposeMsg(e.target.value)}
                  placeholder="Expliquez votre proposition : budget, contreparties souhaitées…"
                />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" className="btn-accent btn-sm" disabled={proposing || !proposeAmount}>
                    {proposing ? "Envoi…" : "Envoyer la contre-proposition"}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={proposing} onClick={() => setShowPropose(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {(sponsor.status === "pending" || sponsor.status === "confirmed") && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Logo de votre entreprise</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ width: 84, height: 84, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 6 }} />
              ) : (
                <div className="sponsor-name-fallback">{(sponsor.company_name ?? "?").charAt(0).toUpperCase()}</div>
              )}
              <div>
                <button className="btn-ghost btn-sm" disabled={uploading} onClick={() => fileInput.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Upload size={14} /> {uploading ? "Envoi…" : logoUrl ? "Changer le logo" : "Ajouter votre logo"}
                </button>
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>PNG ou JPEG, fond clair de préférence.</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                }}
              />
            </div>
            {error && <div className="alert err" role="alert">{error}</div>}
          </div>
        )}

        {(sponsor.status === "pending" || sponsor.status === "confirmed") && showcase !== "logo" && (
          <form className="card" onSubmit={saveProfile}>
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Megaphone size={17} /> Votre vitrine sur la page de l&apos;événement
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Votre palier <strong>{myTier?.name}</strong> inclut une vitrine{" "}
              {showcase === "full" ? (
                <>
                  <strong>complète</strong> : présentation, coordonnées, réseaux sociaux, jusqu&apos;à 6 photos et
                  une vidéo
                </>
              ) : (
                <>
                  <strong>intermédiaire</strong> : présentation, coordonnées et réseaux sociaux
                </>
              )}
              . Tout est visible par les visiteurs de la page de l&apos;événement.
            </p>

            <label>Présentation de votre entreprise</label>
            <textarea
              rows={4}
              maxLength={1200}
              value={profile.description}
              onChange={(e) => setProfile({ ...profile, description: e.target.value })}
              placeholder="Qui vous êtes, ce que vous faites, pourquoi vous soutenez cet événement…"
            />
            <div className="grid2">
              <div>
                <label>Adresse</label>
                <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
              </div>
              <div>
                <label>Téléphone</label>
                <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid2">
              <div>
                <label>Email public</label>
                <input type="email" value={profile.public_email} onChange={(e) => setProfile({ ...profile, public_email: e.target.value })} />
              </div>
              <div>
                <label>Site web</label>
                <input type="url" value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="https://…" />
              </div>
            </div>

            <label style={{ marginTop: 16 }}>Réseaux sociaux</label>
            <div className="grid2">
              {SOCIAL_KEYS.map((key) => (
                <div key={key}>
                  <label style={{ fontWeight: 400, fontSize: 12, margin: "8px 0 2px" }}>{SOCIAL_LABELS[key]}</label>
                  <input
                    type="url"
                    value={profile.socials[key] ?? ""}
                    onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, [key]: e.target.value } })}
                    placeholder="https://…"
                  />
                </div>
              ))}
            </div>

            {showcase === "full" && (
              <>
                <label style={{ marginTop: 16 }}>Vidéo de présentation (lien YouTube ou Vimeo)</label>
                <input
                  type="url"
                  value={profile.video_url}
                  onChange={(e) => setProfile({ ...profile, video_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                {profile.video_url && !embed && (
                  <p className="muted" style={{ color: "var(--err)", fontSize: 13 }}>
                    Lien non reconnu — collez une URL YouTube ou Vimeo.
                  </p>
                )}
                {embed && (
                  <div className="sponsor-video" style={{ marginTop: 8 }}>
                    <iframe src={embed} title="Aperçu vidéo" allowFullScreen loading="lazy" />
                  </div>
                )}

                <label style={{ marginTop: 16 }}>Photos ({data.photos.length}/6)</label>
                <div className="sponsor-photo-grid">
                  {data.photos.map((p) => (
                    <div key={p.id} className="sponsor-photo">
                      <img src={`${API_BASE}/api/public/media/${p.id}/file?thumb=1`} alt="" loading="lazy" />
                      <button
                        type="button"
                        className="sponsor-photo-del"
                        aria-label="Supprimer la photo"
                        onClick={() =>
                          api(`/api/public/sponsor/${token}/media/${p.id}`, { method: "DELETE", auth: false })
                            .then(load)
                            .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
                        }
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                  {data.photos.length < 6 && (
                    <button
                      type="button"
                      className="sponsor-photo-add"
                      disabled={photoUploading}
                      onClick={() => photoInput.current?.click()}
                    >
                      <ImagePlus />
                      {photoUploading ? "Envoi…" : "Ajouter"}
                    </button>
                  )}
                </div>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPhoto(f);
                  }}
                />
              </>
            )}

            {profileSaved && <div className="alert ok" role="status">Vitrine enregistrée ✓</div>}
            <button type="submit" className="btn-accent" disabled={savingProfile}>
              {savingProfile ? "Enregistrement…" : "Enregistrer ma vitrine"}
            </button>
          </form>
        )}

        {sponsor.status === "invited" && (
          <form onSubmit={commit}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Choisissez votre palier de sponsoring</h3>
              {tiers.length === 0 && <p className="muted">Aucune offre de sponsoring n&apos;est publiée pour le moment.</p>}
              {tiers.map((t) => {
                const remaining = t.quantity - takenBy(t.id);
                const soldOut = remaining <= 0;
                const perks = parsePerks(t.perks);
                const selected = tierId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`cat-card ${selected ? "selected" : ""} ${soldOut ? "disabled" : ""} ${perks.length ? "has-perks" : ""}`}
                    onClick={() => !soldOut && setTierId(t.id)}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={0}
                  >
                    <div className="cat-card-head">
                      <div>
                        <div className="cat-name">{t.name}</div>
                        <div className="cat-remaining">
                          {soldOut
                            ? "Complet"
                            : `${remaining} place${remaining > 1 ? "s" : ""} de sponsoring`}
                        </div>
                        {t.description && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{t.description}</div>}
                      </div>
                      <div className="cat-price">{formatPrice(t.price_cents, t.currency)}</div>
                    </div>
                    {perks.length > 0 && (
                      <ul className="cat-perks">
                        {perks.map((p, i) => (
                          <li key={i} style={{ transitionDelay: selected ? `${i * 45}ms` : "0ms" }}>
                            <Check /> {p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Building2 size={17} /> Votre entreprise
              </h3>
              <label>Nom de l&apos;entreprise *</label>
              <input required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Entreprise inc." />
              <div className="grid2">
                <div>
                  <label>Site web (optionnel)</label>
                  <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
                </div>
                <div>
                  <label>Personne contact (optionnel)</label>
                  <input value={contact} onChange={(e) => setContact(e.target.value)} />
                </div>
              </div>
              <label>Message à l&apos;organisation (optionnel)</label>
              <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
              <p className="muted" style={{ fontSize: 13 }}>
                En confirmant, vous vous engagez pour le palier sélectionné. L&apos;organisation vous contactera
                pour le paiement (virement ou facture) et confirmera ensuite votre sponsoring.
              </p>
              {error && <div className="alert err" role="alert">{error}</div>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button type="submit" className="btn-accent" disabled={busy || !tierId || !company}>
                  {busy ? "Envoi…" : "Confirmer mon engagement"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm("Décliner cette proposition de sponsoring ? L'organisation en sera informée.")) return;
                    setBusy(true);
                    api(`/api/public/sponsor/${token}/decline`, { method: "POST", auth: false, body: {} })
                      .then(load)
                      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
                      .finally(() => setBusy(false));
                  }}
                >
                  Décliner la proposition
                </button>
              </div>
            </div>
          </form>
        )}

        {(sponsor.status === "pending" || sponsor.status === "confirmed") && (
          <div className="card directory-cta" style={{ marginTop: 24 }}>
            <div>
              <h3 style={{ margin: "0 0 4px" }}>Recevez d&apos;autres opportunités de sponsoring</h3>
              <p className="muted" style={{ margin: 0 }}>
                Créez gratuitement le profil de votre entreprise dans l&apos;annuaire EventGalo : les associations
                qui organisent des événements pourront vous découvrir et vous inviter.
              </p>
            </div>
            <a className="btn btn-ghost" href="/entreprise" style={{ marginTop: 0, whiteSpace: "nowrap" }}>
              Créer mon profil
            </a>
          </div>
        )}

        {sponsor.status === "declined" && (
          <div className="alert info">Cette invitation de sponsoring a été close par l&apos;organisation.</div>
        )}
      </main>
    </>
  );
}
