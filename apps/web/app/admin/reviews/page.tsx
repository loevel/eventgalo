"use client";

import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";

interface Review {
  id: string;
  sponsor_id: string;
  rated_by: "organizer" | "company";
  rating: number;
  comment: string | null;
  created_at: string;
  sponsor_company_name: string | null;
  company_id: string | null;
  company_name: string | null;
  event_title: string;
  public_slug: string;
  organizer_email: string;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [onlyLow, setOnlyLow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load(low: boolean) {
    api<{ reviews: Review[] }>(`/api/admin/reviews?low=${low ? "1" : "0"}`)
      .then((r) => setReviews(r.reviews))
      .catch((e) => setError(e.message));
  }

  useEffect(() => load(onlyLow), [onlyLow]);

  async function removeReview(r: Review) {
    if (!confirm("Supprimer définitivement cet avis ? Cette action est irréversible.")) return;
    setBusy(r.id);
    try {
      await api(`/api/admin/reviews/${r.id}`, { method: "DELETE" });
      load(onlyLow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Avis sponsors</h3>
      <p className="muted">
        Avis laissés par les organisateurs sur les entreprises sponsors (affichés publiquement sur leur profil) et,
        inversement, par les entreprises sur leurs sponsoring. Utile pour arbitrer un litige ou retirer un avis
        abusif.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 14 }}>
        <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
        N&apos;afficher que les avis à 1 ou 2 étoiles (potentiellement litigieux)
      </label>
      {error && <div className="alert err" role="alert">{error}</div>}
      {!reviews ? (
        <p className="muted">Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Note</th>
              <th>Auteur</th>
              <th>Noté</th>
              <th>Événement</th>
              <th>Commentaire</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id}>
                <td>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</td>
                <td>{r.rated_by === "organizer" ? "Organisateur" : "Entreprise"}</td>
                <td>
                  {r.rated_by === "organizer"
                    ? (r.company_name ?? r.sponsor_company_name ?? "—")
                    : r.organizer_email}
                </td>
                <td>
                  <a href={`/e/${r.public_slug}`} target="_blank" rel="noreferrer">{r.event_title}</a>
                  <div className="muted" style={{ fontSize: 12 }}>{r.organizer_email}</div>
                </td>
                <td style={{ maxWidth: 280 }}>{r.comment ?? "—"}</td>
                <td>{formatDate(r.created_at)}</td>
                <td>
                  <button className="btn-sm btn-ghost" disabled={busy === r.id} onClick={() => removeReview(r)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">Aucun avis {onlyLow ? "litigieux" : ""} trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
