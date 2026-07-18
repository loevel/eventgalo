"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, Building2, Check, CreditCard, Handshake, Hourglass, Upload } from "lucide-react";
import { API_BASE, api, formatDate, formatPrice } from "@/lib/api";
import { parsePerks } from "@/lib/perks";

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
  };
  event: {
    title: string;
    description: string | null;
    starts_at: string | null;
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
  }>;
  taken: Array<{ tier_id: string; n: number }>;
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

  if (error && !data) return <main className="container narrow"><div className="alert err">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const { sponsor, event: ev, tiers } = data;
  const takenBy = (id: string) => data.taken.find((t) => t.tier_id === id)?.n ?? 0;
  const logoUrl = logoId ? `${API_BASE}/api/public/media/${logoId}/file` : null;

  return (
    <>
      <div className="sponsor-hero">
        <div className="sponsor-hero-content">
          {ev.logo_media_id && (
            <img className="event-logo" src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file`} alt="" style={{ margin: "0 auto 14px" }} />
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
            {data.stripe_enabled && (sponsor.amount_cents ?? 0) > 0 && !justPaid ? (
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
              !justPaid && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  L&apos;organisation vous contactera pour finaliser le paiement (virement ou facture). Votre logo
                  apparaîtra sur la page de l&apos;événement dès confirmation.
                </p>
              )
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
            {error && <div className="alert err">{error}</div>}
          </div>
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
              {error && <div className="alert err">{error}</div>}
              <button type="submit" className="btn-accent" disabled={busy || !tierId || !company}>
                {busy ? "Envoi…" : "Confirmer mon engagement"}
              </button>
            </div>
          </form>
        )}

        {sponsor.status === "declined" && (
          <div className="alert info">Cette invitation de sponsoring a été close par l&apos;organisation.</div>
        )}
      </main>
    </>
  );
}
