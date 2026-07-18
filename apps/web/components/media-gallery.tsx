"use client";

import { API_BASE, formatDate } from "@/lib/api";

export interface MediaItem {
  id: string;
  guest_id: string | null;
  guest_name: string | null;
  content_type: string;
  created_at: string;
}

export function MediaGallery({
  media,
  canDelete,
  onDelete,
  coverId,
  onSetCover,
}: {
  media: MediaItem[];
  /** Détermine si le bouton supprimer est affiché pour un élément. */
  canDelete?: (m: MediaItem) => boolean;
  onDelete?: (m: MediaItem) => void;
  /** id de la photo actuellement utilisée comme couverture de l'événement. */
  coverId?: string | null;
  onSetCover?: (m: MediaItem | null) => void;
}) {
  if (!media.length) return <p className="muted">Aucune photo pour le moment.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
      {media.map((m) => {
        const isCover = coverId === m.id;
        return (
          <div key={m.id} className="card" style={{ padding: 8, margin: 0, position: "relative" }}>
            {isCover && (
              <span className="badge ok" style={{ position: "absolute", top: 14, left: 14 }}>
                Couverture
              </span>
            )}
            <img
              src={`${API_BASE}/api/public/media/${m.id}/file`}
              alt={`Photo de ${m.guest_name ?? "l'organisateur"}`}
              loading="lazy"
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {m.guest_name ?? "Organisateur"} · {formatDate(m.created_at)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {onSetCover && (
                <button
                  className="btn-sm btn-ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => onSetCover(isCover ? null : m)}
                >
                  {isCover ? "Retirer la couverture" : "Définir comme couverture"}
                </button>
              )}
              {onDelete && canDelete?.(m) && (
                <button
                  className="btn-sm btn-ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    if (confirm("Supprimer cette photo ?")) onDelete(m);
                  }}
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
