"use client";

import Link from "next/link";
import { api, formatPrice } from "@/lib/api";

/**
 * Rapport organisateur : entièrement calculé à partir des données déjà chargées
 * par GET /api/events/:id — aucune nouvelle table ni tracking, juste de l'agrégation.
 */
export function ReportTab({
  categories, sales, refundRequests, waitlist, sponsorTiers, sponsors,
}: {
  categories: Array<Record<string, any>>;
  sales: Array<Record<string, any>>;
  refundRequests: Array<Record<string, any>>;
  waitlist: Array<Record<string, any>>;
  sponsorTiers: Array<Record<string, any>>;
  sponsors: Array<Record<string, any>>;
}) {
  const currency = categories[0]?.currency ?? sponsorTiers[0]?.currency ?? "CAD";

  // Billetterie : revenu réel (billets valides/utilisés) — exclut déjà les remboursés.
  const ticketRevenue = sales.reduce((s, r) => s + (r.revenue_cents ?? 0), 0);
  const ticketsSold = categories.reduce((s, c) => s + c.sold, 0);
  const ticketsCapacity = categories.reduce((s, c) => s + c.quantity, 0);
  const fillRate = ticketsCapacity > 0 ? ticketsSold / ticketsCapacity : null;
  const refundsByStatus = { pending: 0, approved: 0, rejected: 0 };
  for (const r of refundRequests) refundsByStatus[r.status as keyof typeof refundsByStatus]++;

  // Sponsoring : réalisé vs potentiel si tous les paliers étaient vendus au complet.
  const confirmedSponsors = sponsors.filter((s) => s.status === "confirmed");
  const sponsorRevenue = confirmedSponsors.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  const sponsorPotential = sponsorTiers.reduce((s, t) => s + t.price_cents * t.quantity, 0);
  const sponsorRealization = sponsorPotential > 0 ? sponsorRevenue / sponsorPotential : null;
  const pipeline = { invited: 0, pending: 0, confirmed: 0, declined: 0 };
  for (const s of sponsors) if (s.status in pipeline) pipeline[s.status as keyof typeof pipeline]++;
  const decided = pipeline.confirmed + pipeline.declined;
  const acceptanceRate = decided > 0 ? pipeline.confirmed / decided : null;
  const revenueByTier = new Map<string, number>();
  for (const s of confirmedSponsors) {
    const name = s.tier_name ?? "Sans palier";
    revenueByTier.set(name, (revenueByTier.get(name) ?? 0) + (s.amount_cents ?? 0));
  }

  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <Link href="/dashboard/analytics" className="btn btn-ghost btn-sm">
          Voir les analyses globales →
        </Link>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Billetterie</h3>
        {categories.length === 0 ? (
          <p className="muted">Aucune catégorie de billet pour cet événement.</p>
        ) : (
          <>
            <div className="report-stats">
              <div className="report-stat">
                <span className="report-stat-value">{formatPrice(ticketRevenue, currency)}</span>
                <span className="report-stat-label">Revenu billetterie</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{ticketsSold}/{ticketsCapacity}</span>
                <span className="report-stat-label">Billets vendus ({pct(fillRate)} rempli)</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{waitlist.length}</span>
                <span className="report-stat-label">En liste d&apos;attente</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{refundsByStatus.approved}</span>
                <span className="report-stat-label">
                  Remboursés{refundsByStatus.pending > 0 ? ` (${refundsByStatus.pending} en attente)` : ""}
                </span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>Vendus</th>
                  <th>Remplissage</th>
                  <th>Prix</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.sold}/{c.quantity}</td>
                    <td>{pct(c.quantity > 0 ? c.sold / c.quantity : null)}</td>
                    <td>{formatPrice(c.price_cents, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sponsoring</h3>
        {sponsorTiers.length === 0 ? (
          <p className="muted">Aucun palier de sponsoring pour cet événement.</p>
        ) : (
          <>
            <div className="report-stats">
              <div className="report-stat">
                <span className="report-stat-value">{formatPrice(sponsorRevenue, currency)}</span>
                <span className="report-stat-label">
                  Confirmé{sponsorPotential > 0 ? ` sur ${formatPrice(sponsorPotential, currency)} possibles (${pct(sponsorRealization)})` : ""}
                </span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{pct(acceptanceRate)}</span>
                <span className="report-stat-label">
                  Taux d&apos;acceptation ({pipeline.confirmed} confirmé{pipeline.confirmed > 1 ? "s" : ""},{" "}
                  {pipeline.declined} refusé{pipeline.declined > 1 ? "s" : ""})
                </span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{pipeline.invited + pipeline.pending}</span>
                <span className="report-stat-label">En cours (invité/engagé)</span>
              </div>
            </div>
            {revenueByTier.size > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Palier</th>
                    <th>Revenu confirmé</th>
                  </tr>
                </thead>
                <tbody>
                  {[...revenueByTier.entries()].map(([name, cents]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{formatPrice(cents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  );
}
