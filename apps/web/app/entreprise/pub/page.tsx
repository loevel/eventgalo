"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Upload } from "lucide-react";
import { API_BASE, api, formatDate, formatPrice, getToken } from "@/lib/api";
import { CANADIAN_REGIONS, COMPANY_SECTORS } from "@/lib/sponsor";

interface AdSlot {
  id: string;
  title: string;
  link_url: string;
  image_key: string | null;
  sector: string | null;
  region: string | null;
  weeks: number;
  starts_at: string | null;
  ends_at: string | null;
  amount_cents: number;
  currency: string;
  status: "pending_payment" | "active" | "expired" | "rejected";
  paid_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<AdSlot["status"], string> = {
  pending_payment: "En attente de paiement",
  active: "Actif",
  expired: "Expiré",
  rejected: "Rejeté",
};

export default function CompanyAdsPage() {
  const router = useRouter();
  const [ads, setAds] = useState<AdSlot[]>([]);
  const [pricePerWeek, setPricePerWeek] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [sector, setSector] = useState("");
  const [region, setRegion] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ ads: AdSlot[] }>("/api/company/ads").then((r) => setAds(r.ads));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/connexion?intent=entreprise&next=/entreprise/pub");
      return;
    }
    load();
    fetch(`${API_BASE}/api/public/settings/ad-price`)
      .then((r) => r.json())
      .then((d: { price_cents_per_week: number }) => setPricePerWeek(d.price_cents_per_week))
      .catch(() => setPricePerWeek(null));
  }, [load, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") setFlash("Paiement reçu — votre annonce sera diffusée sous peu.");
    else if (params.get("canceled") === "1") setError("Paiement annulé.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const created = await api<{ id: string }>("/api/company/ads", {
        method: "POST",
        body: { title, link_url: linkUrl, sector: sector || null, region: region || null, weeks },
      });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        await api(`/api/company/ads/${created.id}/image`, { method: "POST", body: fd });
      }
      const checkout = await api<{ checkout_url: string }>(`/api/company/ads/${created.id}/checkout`, {
        method: "POST",
      });
      window.location.href = checkout.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  const estimate = pricePerWeek != null ? formatPrice(pricePerWeek * weeks, "CAD") : null;

  return (
    <main className="container narrow">
      <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Megaphone size={24} /> Bandeau publicitaire
      </h1>
      <p className="muted">
        Mettez votre entreprise en avant dans le bandeau défilant de la page d&apos;accueil d&apos;EventGalo.
        Ciblage optionnel par secteur et par région — laissez vide pour être visible partout.
      </p>

      {flash && <div className="alert ok">{flash}</div>}
      {error && <div className="alert err">{error}</div>}

      {ads.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Mes annonces</h3>
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Statut</th>
                <th>Diffusion</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => (
                <tr key={ad.id}>
                  <td>{ad.title}</td>
                  <td>{STATUS_LABELS[ad.status]}</td>
                  <td>
                    {ad.starts_at ? `${formatDate(ad.starts_at)} → ${formatDate(ad.ends_at)}` : "—"}
                  </td>
                  <td>{formatPrice(ad.amount_cents, ad.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="card" onSubmit={submit}>
        <label>Titre de l&apos;annonce *</label>
        <input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom de votre entreprise ou de votre offre" />

        <label>Lien de destination *</label>
        <input required type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />

        <div className="grid2">
          <div>
            <label>Secteur ciblé (optionnel)</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Tous secteurs</option>
              {COMPANY_SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Région ciblée (optionnel)</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Tout le Canada</option>
              {CANADIAN_REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <label>Durée</label>
        <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          {[1, 2, 4, 8, 12].map((w) => (
            <option key={w} value={w}>{w} semaine{w > 1 ? "s" : ""}</option>
          ))}
        </select>

        <label>Image (format paysage recommandé)</label>
        <label className="btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content", cursor: "pointer" }}>
          <Upload size={15} /> {file ? file.name : "Choisir une image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {estimate && (
          <p className="muted" style={{ marginTop: 12 }}>
            Montant estimé : <strong>{estimate}</strong> pour {weeks} semaine{weeks > 1 ? "s" : ""}.
          </p>
        )}

        <button type="submit" className="btn btn-gold" disabled={busy} style={{ marginTop: 12 }}>
          {busy ? "…" : "Payer et diffuser"}
        </button>
      </form>
    </main>
  );
}
