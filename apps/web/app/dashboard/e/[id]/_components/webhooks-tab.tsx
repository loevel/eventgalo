"use client";

import { useState, useEffect, useCallback } from "react";
import { api, formatDate } from "@/lib/api";
import { CopyField } from "./shared-cards";

const WEBHOOK_TYPE_LABELS: Record<string, string> = {
  "ticket.sold": "Billet vendu",
  "sponsor.confirmed": "Sponsoring confirmé",
  "sponsor.declined": "Sponsoring refusé",
  "refund.requested": "Demande de remboursement",
};

/**
 * Webhooks sortants génériques : brancher Zapier/Make ou un outil maison sur les
 * événements clés (billet vendu, sponsoring confirmé/refusé, remboursement
 * demandé) sans intégration nommée à maintenir. Charge ses propres données —
 * cet onglet n'a pas besoin du payload principal de l'événement.
 */
export function WebhooksTab({ eventId }: { eventId: string }) {
  const [webhooks, setWebhooks] = useState<Array<Record<string, any>> | null>(null);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ webhooks: Array<Record<string, any>>; available_types: string[] }>(`/api/events/${eventId}/webhooks`)
      .then((r) => {
        setWebhooks(r.webhooks);
        setAvailableTypes(r.available_types);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [eventId]);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; secret: string }>(`/api/events/${eventId}/webhooks`, {
        method: "POST",
        body: { url, event_types: types.length ? types : undefined },
      });
      setNewSecret(res.secret);
      setUrl("");
      setTypes([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!webhooks) return <div className="card"><p className="muted">Chargement…</p></div>;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Webhooks sortants</h3>
      <p className="muted">
        Recevez une notification HTTP sur les événements clés de votre événement — utile pour brancher Zapier,
        Make, ou votre propre outil (CRM, feuille de calcul, script maison…). Chaque envoi est signé (en-tête{" "}
        <code>X-EventGalo-Signature</code>) pour vérifier qu&apos;il vient bien d&apos;EventGalo.
      </p>

      {error && <div className="alert err" role="alert">{error}</div>}
      {newSecret && (
        <div className="alert warn" role="alert">
          <strong>Secret du webhook (affiché une seule fois) :</strong>
          <CopyField value={newSecret} />
          Conservez-le pour vérifier la signature des envois — on ne pourra plus vous le remontrer.
        </div>
      )}

      {webhooks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Événements</th>
              <th>Dernière livraison</th>
              <th>Actif</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => {
              const subscribed: string[] = w.event_types ? JSON.parse(w.event_types) : [];
              return (
                <tr key={w.id}>
                  <td style={{ maxWidth: 260, overflowWrap: "break-word" }}>{w.url}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {subscribed.length ? subscribed.map((t) => WEBHOOK_TYPE_LABELS[t] ?? t).join(", ") : "Tous"}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {w.last_triggered_at ? (
                      <>
                        {formatDate(w.last_triggered_at)}{" "}
                        <span className={`badge ${w.last_status >= 200 && w.last_status < 300 ? "ok" : "err"}`}>
                          {w.last_status === 0 ? "Échec réseau" : w.last_status}
                        </span>
                      </>
                    ) : (
                      <span className="muted">Jamais déclenché</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(w.enabled)}
                      onChange={(e) => {
                        api(`/api/events/${eventId}/webhooks/${w.id}`, { method: "PATCH", body: { enabled: e.target.checked } })
                          .then(load)
                          .catch((err) => setError(err instanceof Error ? err.message : "Erreur"));
                      }}
                    />
                  </td>
                  <td>
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => {
                        if (confirm("Supprimer ce webhook ?")) {
                          api(`/api/events/${eventId}/webhooks/${w.id}`, { method: "DELETE" })
                            .then(load)
                            .catch((err) => setError(err instanceof Error ? err.message : "Erreur"));
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h4 style={{ marginBottom: 4 }}>Ajouter un webhook</h4>
      <label>URL (https:// uniquement) *</label>
      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/…" />
      <label>Événements à recevoir (aucune case = tous)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "6px 0 14px" }}>
        {availableTypes.map((t) => (
          <label key={t} className="check" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={types.includes(t)}
              onChange={(e) =>
                setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))
              }
            />
            <span style={{ fontWeight: 400 }}>{WEBHOOK_TYPE_LABELS[t] ?? t}</span>
          </label>
        ))}
      </div>
      <button className="btn-accent" disabled={busy || !url} onClick={create}>
        {busy ? "Ajout…" : "Ajouter le webhook"}
      </button>
    </div>
  );
}
