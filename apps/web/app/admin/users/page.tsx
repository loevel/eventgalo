"use client";

import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  events_count: number;
}

const ROLE_LABEL: Record<string, string> = { user: "Utilisateur", admin: "Admin", superadmin: "Super-admin" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load(query = "") {
    api<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`)
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message));
  }

  useEffect(() => load(), []);

  async function suspend(u: AdminUser) {
    const reason = prompt(`Motif de suspension du compte ${u.email} (optionnel) :`);
    if (reason === null) return;
    setBusy(u.id);
    try {
      await api(`/api/admin/users/${u.id}/suspend`, { method: "POST", body: { reason: reason || undefined } });
      load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function reactivate(u: AdminUser) {
    setBusy(u.id);
    try {
      await api(`/api/admin/users/${u.id}/reactivate`, { method: "POST" });
      load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 14 }}
      >
        <input placeholder="Rechercher par email ou nom…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="btn-sm btn-ghost">Rechercher</button>
      </form>
      {error && <div className="alert err">{error}</div>}
      {!users ? (
        <p className="muted">Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Événements</th>
              <th>Inscrit le</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name ?? "—"}
                  <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                </td>
                <td>{ROLE_LABEL[u.role] ?? u.role}</td>
                <td>
                  {u.status === "suspended" ? (
                    <span className="badge err" title={u.suspended_reason ?? undefined}>Suspendu</span>
                  ) : (
                    <span className="badge ok">Actif</span>
                  )}
                </td>
                <td>{u.events_count}</td>
                <td>{formatDate(u.created_at)}</td>
                <td>
                  {u.status === "suspended" ? (
                    <button className="btn-sm btn-ghost" disabled={busy === u.id} onClick={() => reactivate(u)}>
                      Réactiver
                    </button>
                  ) : (
                    <button className="btn-sm btn-ghost" disabled={busy === u.id} onClick={() => suspend(u)}>
                      Suspendre
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Aucun utilisateur trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
