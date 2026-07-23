"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Settings {
  platform_fee_percent: string;
  platform_fee_fixed_cents: string;
  feature_signups_enabled: string;
  banner_enabled: string;
  banner_kind: string;
  banner_text: string;
  banner_link: string;
  ad_slot_price_cents_per_week: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [percent, setPercent] = useState("");
  const [fixed, setFixed] = useState("");
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerKind, setBannerKind] = useState("info");
  const [bannerText, setBannerText] = useState("");
  const [bannerLink, setBannerLink] = useState("");
  const [adPrice, setAdPrice] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>("/api/admin/settings").then((r) => {
      setSettings(r.settings);
      setPercent(r.settings.platform_fee_percent);
      setFixed((Number(r.settings.platform_fee_fixed_cents) / 100).toFixed(2));
      setSignupsEnabled(r.settings.feature_signups_enabled !== "0");
      setBannerEnabled(r.settings.banner_enabled === "1");
      setBannerKind(r.settings.banner_kind || "info");
      setBannerText(r.settings.banner_text || "");
      setBannerLink(r.settings.banner_link || "");
      setAdPrice((Number(r.settings.ad_slot_price_cents_per_week) / 100).toFixed(2));
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: {
          platform_fee_percent: percent,
          platform_fee_fixed_cents: String(Math.round(Number(fixed) * 100)),
          feature_signups_enabled: signupsEnabled ? "1" : "0",
          banner_enabled: bannerEnabled ? "1" : "0",
          banner_kind: bannerKind,
          banner_text: bannerText,
          banner_link: bannerLink,
          ad_slot_price_cents_per_week: String(Math.round(Number(adPrice) * 100)),
        },
      });
      setStatus({ kind: "ok", text: "Paramètres enregistrés." });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p className="muted">Chargement…</p>;

  return (
    <form onSubmit={save}>
      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Frais de service</h3>
        <p className="muted">
          Ajoutés au moment du paiement pour les acheteurs de billets et les entreprises sponsors, quand
          l&apos;organisateur a activé les paiements Stripe Connect. L&apos;organisateur reçoit toujours 100 % du prix
          affiché.
        </p>
        <label htmlFor="percent">Pourcentage du montant</label>
        <input id="percent" type="number" min="0" max="100" step="0.1" value={percent} onChange={(e) => setPercent(e.target.value)} />

        <label htmlFor="fixed" style={{ marginTop: 10, display: "block" }}>
          Montant fixe par billet/palier (CAD)
        </label>
        <input id="fixed" type="number" min="0" step="0.01" value={fixed} onChange={(e) => setFixed(e.target.value)} />
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Bandeau publicitaire</h3>
        <p className="muted">Prix facturé aux entreprises pour un créneau dans le bandeau de la page d&apos;accueil.</p>
        <label htmlFor="adPrice">Prix par semaine (CAD)</label>
        <input id="adPrice" type="number" min="0" step="0.01" value={adPrice} onChange={(e) => setAdPrice(e.target.value)} />
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Fonctionnalités</h3>
        <div className="check">
          <input id="signups" type="checkbox" checked={signupsEnabled} onChange={(e) => setSignupsEnabled(e.target.checked)} />
          <label htmlFor="signups" style={{ margin: 0, fontWeight: 400 }}>
            Autoriser les nouvelles inscriptions (les comptes existants peuvent toujours se connecter)
          </label>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Bannière d&apos;annonce</h3>
        <p className="muted">Affichée en haut de toutes les pages publiques du site.</p>
        <div className="check">
          <input id="banner" type="checkbox" checked={bannerEnabled} onChange={(e) => setBannerEnabled(e.target.checked)} />
          <label htmlFor="banner" style={{ margin: 0, fontWeight: 400 }}>Activer la bannière</label>
        </div>
        <label htmlFor="bannerKind" style={{ marginTop: 10, display: "block" }}>Type</label>
        <select id="bannerKind" value={bannerKind} onChange={(e) => setBannerKind(e.target.value)}>
          <option value="info">Information</option>
          <option value="warning">Avertissement</option>
          <option value="success">Bonne nouvelle</option>
        </select>
        <label htmlFor="bannerText">Message</label>
        <input id="bannerText" value={bannerText} onChange={(e) => setBannerText(e.target.value)} placeholder="Maintenance prévue le 25 juillet de 2h à 4h." maxLength={300} />
        <label htmlFor="bannerLink">Lien (optionnel)</label>
        <input id="bannerLink" value={bannerLink} onChange={(e) => setBannerLink(e.target.value)} placeholder="https://…" />
      </div>

      <button type="submit" className="btn-accent" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
      {status && <div className={`alert ${status.kind}`}>{status.text}</div>}
    </form>
  );
}
