"use client";

import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";

interface AdminCompany {
  id: string;
  name: string;
  kind: "company" | "professional";
  sector: string | null;
  city: string | null;
  website: string | null;
  public_email: string | null;
  description: string | null;
  listed: number;
  vendor_listed: number;
  verified: number;
  created_at: string;
  sponsorships: number;
}

interface RiskAssessment {
  risk: "low" | "medium" | "high";
  reasons: string;
}

const RISK_BADGE: Record<RiskAssessment["risk"], string> = { low: "ok", medium: "warn", high: "err" };
const RISK_LABEL: Record<RiskAssessment["risk"], string> = { low: "Faible", medium: "Moyen", high: "Élevé" };

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [risks, setRisks] = useState<Record<string, RiskAssessment>>({});

  function load(query = "") {
    api<{ companies: AdminCompany[] }>(`/api/admin/companies?q=${encodeURIComponent(query)}`)
      .then((r) => setCompanies(r.companies))
      .catch((e) => setError(e.message));
  }

  useEffect(() => load(), []);

  async function riskCheck(co: AdminCompany) {
    setBusy(`risk-${co.id}`);
    try {
      const result = await api<RiskAssessment>(`/api/admin/companies/${co.id}/risk-check`, { method: "POST" });
      setRisks((r) => ({ ...r, [co.id]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function unlist(co: AdminCompany) {
    if (!confirm(`Retirer « ${co.name} » des annuaires publics ? Le propriétaire pourra le rendre visible à nouveau.`)) return;
    setBusy(`unlist-${co.id}`);
    try {
      await api(`/api/admin/companies/${co.id}/unlist`, { method: "POST" });
      load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Entreprises</h3>
      <p className="muted">
        Profils de l&apos;annuaire (entreprises et professionnels). La vérification IA est une aide à la décision —
        elle signale des incohérences ou du contenu générique à partir du profil, ce n&apos;est pas un verdict automatique.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 14 }}
      >
        <input placeholder="Rechercher par nom, site ou email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="btn-sm btn-ghost">Rechercher</button>
      </form>
      {error && <div className="alert err">{error}</div>}
      {!companies ? (
        <p className="muted">Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Profil</th>
              <th>Secteur / ville</th>
              <th>Statut</th>
              <th>Sponsorings</th>
              <th>Inscrite le</th>
              <th>Vérification IA</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {companies.map((co) => {
              const risk = risks[co.id];
              const listed = Boolean(co.listed || co.vendor_listed);
              return (
                <tr key={co.id}>
                  <td>
                    {co.name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {co.kind === "professional" ? "Professionnel" : "Entreprise"}
                      {co.website ? ` · ${co.website}` : ""}
                    </div>
                  </td>
                  <td>{[co.sector, co.city].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    {Boolean(co.verified) && <span className="badge ok" style={{ marginRight: 6 }}>Vérifiée</span>}
                    {listed ? <span className="badge ok">Listée</span> : <span className="badge mut">Retirée</span>}
                  </td>
                  <td>{co.sponsorships}</td>
                  <td>{formatDate(co.created_at)}</td>
                  <td style={{ maxWidth: 260 }}>
                    {risk ? (
                      <>
                        <span className={`badge ${RISK_BADGE[risk.risk]}`}>{RISK_LABEL[risk.risk]}</span>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{risk.reasons}</div>
                      </>
                    ) : (
                      <button className="btn-sm btn-ghost" disabled={busy === `risk-${co.id}`} onClick={() => riskCheck(co)}>
                        {busy === `risk-${co.id}` ? "Analyse…" : "✨ Vérifier avec l'IA"}
                      </button>
                    )}
                  </td>
                  <td>
                    {listed && (
                      <button className="btn-sm btn-ghost" disabled={busy === `unlist-${co.id}`} onClick={() => unlist(co)}>
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">Aucune entreprise trouvée.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
