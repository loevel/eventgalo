"use client";

import { API_BASE, formatDate } from "@/lib/api";

export interface MediaItem {
  id: string;
  guest_id: string | null;
  guest_name: string | null;
  content_type: string;
  created_at: string;
  featured?: number;
}

export function MediaGallery({
  media,
  canDelete,
  onDelete,
  coverId,
  onSetCover,
  logoId,
  onSetLogo,
  onToggleFeatured,
}: {
  media: MediaItem[];
  /** Détermine si le bouton supprimer est affiché pour un élément. */
  canDelete?: (m: MediaItem) => boolean;
  onDelete?: (m: MediaItem) => void;
  /** id de la photo actuellement utilisée comme couverture de l'événement. */
  coverId?: string | null;
  onSetCover?: (m: MediaItem | null) => void;
  /** id de la photo actuellement utilisée comme logo de l'association. */
  logoId?: string | null;
  onSetLogo?: (m: MediaItem | null) => void;
  /** Bascule la visibilité d'une photo dans la galerie publique. */
  onToggleFeatured?: (m: MediaItem, featured: boolean) => void;
}) {
  if (!media.length) return <p className="muted">Aucune photo pour le moment.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
      {media.map((m) => {
        const isCover = coverId === m.id;
        const isLogo = logoId === m.id;
        const isFeatured = Boolean(m.featured);
        return (
          <div key={m.id} className="card" style={{ padding: 8, margin: 0, position: "relative" }}>
            <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 4, flexWrap: "wrap", zIndex: 1 }}>
              {isCover && <span className="badge ok">Couverture</span>}
              {isLogo && <span className="badge warn">Logo</span>}
              {isFeatured && <span className="badge mut">Page publique</span>}
            </div>
            <img
              src={`${API_BASE}/api/public/media/${m.id}/file?thumb=1`}
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
              {onSetLogo && (
                <button
                  className="btn-sm btn-ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => onSetLogo(isLogo ? null : m)}
                >
                  {isLogo ? "Retirer le logo" : "Définir comme logo"}
                </button>
              )}
              {onToggleFeatured && (
                <button
                  className="btn-sm btn-ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => onToggleFeatured(m, !isFeatured)}
                >
                  {isFeatured ? "Masquer de la page publique" : "Afficher sur la page publique"}
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
