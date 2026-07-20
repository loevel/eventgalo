"use client";

import { useEffect, useState } from "react";
import { API_BASE, api, formatDate, formatPrice, getToken } from "@/lib/api";

interface Transaction {
  id: string;
  buyer_name: string;
  buyer_email: string;
  quantity: number;
  amount_cents: number;
  service_fee_cents: number;
  currency: string;
  status: string;
  created_at: string;
  stripe_destination_account: string | null;
  event_id: string;
  event_title: string;
  organizer_email: string;
}

interface ConnectAccount {
  id: string;
  email: string;
  name: string | null;
  stripe_account_id: string;
  stripe_charges_enabled: number;
  stripe_payouts_enabled: number;
  stripe_details_submitted: number;
}

const TX_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "warn" },
  paid: { label: "Payé", cls: "ok" },
  refunded: { label: "Remboursé", cls: "mut" },
  canceled: { label: "Annulé", cls: "err" },
};

export default function AdminFinancesPage() {
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [accounts, setAccounts] = useState<ConnectAccount[] | null>(null);
  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadTxs(status = "") {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    api<{ transactions: Transaction[] }>(`/api/admin/transactions?${params}`)
      .then((r) => setTxs(r.transactions))
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadTxs();
    api<{ accounts: ConnectAccount[] }>("/api/admin/connect-accounts")
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      {error && <div className="alert err">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Comptes Stripe Connect</h3>
        <p className="muted">Organisateurs ayant démarré l&apos;onboarding pour recevoir leurs paiements directement.</p>
        {!accounts ? (
          <p className="muted">Chargement…</p>
        ) : accounts.length === 0 ? (
          <p className="muted">Aucun organisateur n&apos;a encore activé Stripe Connect.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Organisateur</th>
                <th>Compte Stripe</th>
                <th>Infos soumises</th>
                <th>Paiements activés</th>
                <th>Versements activés</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name ?? "—"}
                    <div className="muted" style={{ fontSize: 12 }}>{a.email}</div>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{a.stripe_account_id}</td>
                  <td>{a.stripe_details_submitted ? "✓" : "—"}</td>
                  <td>{a.stripe_charges_enabled ? <span className="badge ok">Oui</span> : <span className="badge warn">Non</span>}</td>
                  <td>{a.stripe_payouts_enabled ? <span className="badge ok">Oui</span> : <span className="badge warn">Non</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Transactions</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <select
            value={txStatus}
            onChange={(e) => {
              setTxStatus(e.target.value);
              loadTxs(e.target.value);
            }}
          >
            <option value="">Tous les statuts</option>
            <option value="paid">Payé</option>
            <option value="pending">En attente</option>
            <option value="refunded">Remboursé</option>
            <option value="canceled">Annulé</option>
          </select>
          <button
            type="button"
            className="btn-sm btn-ghost"
            onClick={() => {
              const params = new URLSearchParams();
              if (txStatus) params.set("status", txStatus);
              fetch(`${API_BASE}/api/admin/transactions/export?${params}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
              })
                .then((r) => r.blob())
                .then((b) => {
                  const url = URL.createObjectURL(b);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `eventgalo-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                });
            }}
          >
            ⬇ Exporter (CSV)
          </button>
        </div>
        {!txs ? (
          <p className="muted">Chargement…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Événement</th>
                <th>Acheteur</th>
                <th>Montant</th>
                <th>Frais</th>
                <th>Statut</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const s = TX_STATUS_LABEL[t.status] ?? { label: t.status, cls: "mut" };
                return (
                  <tr key={t.id}>
                    <td>
                      {t.event_title}
                      <div className="muted" style={{ fontSize: 12 }}>{t.organizer_email}</div>
                    </td>
                    <td>
                      {t.buyer_name}
                      <div className="muted" style={{ fontSize: 12 }}>{t.buyer_email}</div>
                    </td>
                    <td>{formatPrice(t.amount_cents, t.currency)}</td>
                    <td>{formatPrice(t.service_fee_cents, t.currency)}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td>{formatDate(t.created_at)}</td>
                  </tr>
                );
              })}
              {txs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">Aucune transaction trouvée.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
