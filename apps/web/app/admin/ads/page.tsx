"use client";

import { useEffect, useState } from "react";
import { api, formatDate, formatPrice } from "@/lib/api";

interface AdminAdSlot {
  id: string;
  title: string;
  link_url: string;
  company_name: string;
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

const STATUS_BADGE: Record<AdminAdSlot["status"], string> = {
  pending_payment: "mut",
  active: "ok",
  expired: "mut",
  rejected: "err",
};
const STATUS_LABEL: Record<AdminAdSlot["status"], string> = {
  pending_payment: "En attente",
  active: "Actif",
  expired: "Expiré",
  rejected: "Rejeté",
};

export default function AdminAdsPage() {
  const [ads, setAds] = useState<AdminAdSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api<{ ads: AdminAdSlot[] }>("/api/admin/ads")
      .then((r) => setAds(r.ads))
      .catch((e) => setError(e.message));
  }

  useEffect(() => load(), []);

  async function reject(ad: AdminAdSlot) {
    if (!confirm(`Rejeter l'annonce « ${ad.title} » de ${ad.company_name} ?`)) return;
    setBusy(ad.id);
    try {
      await api(`/api/admin/ads/${ad.id}/reject`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Bandeau publicitaire</h3>
      <p className="muted">Créneaux achetés par des entreprises pour le bandeau défilant de la page d&apos;accueil.</p>
      {error && <div className="alert err" role="alert">{error}</div>}
      {!ads ? (
        <p className="muted">Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Annonce</th>
              <th>Ciblage</th>
              <th>Diffusion</th>
              <th>Montant</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => (
              <tr key={ad.id}>
                <td>
                  {ad.title}
                  <div className="muted" style={{ fontSize: 12 }}>{ad.company_name}</div>
                </td>
                <td>{[ad.sector, ad.region].filter(Boolean).join(" · ") || "Aucun"}</td>
                <td>{ad.starts_at ? `${formatDate(ad.starts_at)} → ${formatDate(ad.ends_at)}` : "—"}</td>
                <td>{formatPrice(ad.amount_cents, ad.currency)}</td>
                <td><span className={`badge ${STATUS_BADGE[ad.status]}`}>{STATUS_LABEL[ad.status]}</span></td>
                <td>
                  {ad.status !== "rejected" && (
                    <button className="btn-sm btn-ghost" disabled={busy === ad.id} onClick={() => reject(ad)}>
                      Rejeter
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {ads.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Aucune annonce.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
