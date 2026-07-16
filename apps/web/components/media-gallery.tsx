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
}: {
  media: MediaItem[];
  /** Détermine si le bouton supprimer est affiché pour un élément. */
  canDelete?: (m: MediaItem) => boolean;
  onDelete?: (m: MediaItem) => void;
}) {
  if (!media.length) return <p className="muted">Aucune photo pour le moment.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
      {media.map((m) => (
        <div key={m.id} className="card" style={{ padding: 8, margin: 0 }}>
          <img
            src={`${API_BASE}/api/public/media/${m.id}/file`}
            alt={`Photo de ${m.guest_name ?? "l'organisateur"}`}
            loading="lazy"
            style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {m.guest_name ?? "Organisateur"} · {formatDate(m.created_at)}
          </div>
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
      ))}
    </div>
  );
}
