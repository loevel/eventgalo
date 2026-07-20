"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Settings {
  platform_fee_percent: string;
  platform_fee_fixed_cents: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [percent, setPercent] = useState("");
  const [fixed, setFixed] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>("/api/admin/settings").then((r) => {
      setSettings(r.settings);
      setPercent(r.settings.platform_fee_percent);
      setFixed((Number(r.settings.platform_fee_fixed_cents) / 100).toFixed(2));
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: { platform_fee_percent: percent, platform_fee_fixed_cents: String(Math.round(Number(fixed) * 100)) },
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
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginTop: 0 }}>Frais de service</h3>
      <p className="muted">
        Ajoutés au moment du paiement pour les acheteurs de billets et les entreprises sponsors, quand
        l&apos;organisateur a activé les paiements Stripe Connect. L&apos;organisateur reçoit toujours 100 % du prix
        affiché.
      </p>
      <form onSubmit={save}>
        <label htmlFor="percent">Pourcentage du montant</label>
        <input id="percent" type="number" min="0" max="100" step="0.1" value={percent} onChange={(e) => setPercent(e.target.value)} />

        <label htmlFor="fixed" style={{ marginTop: 10, display: "block" }}>
          Montant fixe par billet/palier (CAD)
        </label>
        <input id="fixed" type="number" min="0" step="0.01" value={fixed} onChange={(e) => setFixed(e.target.value)} />

        <button type="submit" className="btn-accent" disabled={busy} style={{ marginTop: 14 }}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
      {status && <div className={`alert ${status.kind}`}>{status.text}</div>}
    </div>
  );
}
