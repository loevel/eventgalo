"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ConnectStatus {
  configured: boolean;
  onboarded?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
}

/**
 * Carte « Paiements » du dashboard : onboarding Stripe Connect Express.
 * Une fois activé, l'organisateur reçoit 100 % du prix affiché de ses billets,
 * directement sur son compte bancaire (versements hebdomadaires automatiques).
 */
export function ConnectPaymentsCard() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ConnectStatus>("/api/connect/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status?.configured) return null;

  const active = status.charges_enabled && status.payouts_enabled;

  const startOnboarding = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ onboarding_url: string }>("/api/connect/onboarding", { method: "POST" });
      window.location.href = r.onboarding_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la configuration");
      setBusy(false);
    }
  };

  if (active) {
    return (
      <div className="card" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div>
          <strong>Paiements activés</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            Vos revenus de billetterie et de sponsoring sont versés automatiquement chaque semaine
            sur votre compte bancaire. Vous recevez 100 % du prix affiché.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 560 }}>
          <strong>💳 {status.onboarded ? "Finalisez la configuration de vos paiements" : "Recevez vos revenus automatiquement"}</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {status.onboarded
              ? "Stripe vérifie vos informations ou attend un dernier détail. Reprenez la configuration pour terminer."
              : "Configurez vos paiements en 5 minutes : vos ventes de billets seront versées chaque semaine sur votre compte bancaire, et vous gardez 100 % du prix affiché — les frais de service sont payés par l'acheteur."}
          </div>
          {error && <div className="alert err" role="alert" style={{ marginTop: 8 }}>{error}</div>}
        </div>
        <button className="btn btn-accent" onClick={startOnboarding} disabled={busy}>
          {busy ? "Redirection…" : status.onboarded ? "Reprendre la configuration" : "Configurer mes paiements"}
        </button>
      </div>
    </div>
  );
}
