"use client";

import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";

interface AuditEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
  admin_email: string;
}

const ACTION_LABEL: Record<string, string> = {
  "user.suspend": "Suspension d'un compte",
  "user.reactivate": "Réactivation d'un compte",
  "user.role": "Changement de rôle",
  "event.status": "Changement de statut d'événement",
  "event.delete": "Suppression d'un événement",
  "settings.update": "Modification des paramètres",
  "review.delete": "Suppression d'un avis sponsor",
};

function formatDetails(raw: string | null): string {
  if (!raw) return "—";
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ") || "—";
  } catch {
    return raw;
  }
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ entries: AuditEntry[] }>(`/api/admin/audit-log?page=${page}`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e.message));
  }, [page]);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Journal d&apos;audit</h3>
      <p className="muted">Historique des actions administratives sensibles : suspensions, changements de rôle, modération d&apos;événements, paramètres.</p>
      {error && <div className="alert err" role="alert">{error}</div>}
      {!entries ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Administrateur</th>
                <th>Action</th>
                <th>Cible</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.created_at)}</td>
                  <td>{e.admin_email}</td>
                  <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td>
                    {e.target_type ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {e.target_type}: {e.target_id}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDetails(e.details)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">Aucune action enregistrée pour l&apos;instant.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn-sm btn-ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </button>
            <button className="btn-sm btn-ghost" disabled={entries.length < 30} onClick={() => setPage((p) => p + 1)}>
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
}
