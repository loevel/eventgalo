"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { MediaGallery, type MediaItem } from "@/components/media-gallery";

export function MediaTab({
  eventId, coverId, logoId, act,
}: {
  eventId: string;
  coverId: string | null;
  logoId: string | null;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ media: MediaItem[] }>(`/api/events/${eventId}/media`)
      .then((r) => setMedia(r.media))
      .catch((e) => setError(e.message));
  }, [eventId]);

  useEffect(load, [load]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/events/${eventId}/media`, { method: "POST", body: fd });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter une photo</h3>
        <p className="muted">Les photos sont visibles par tous les invités sur leur page d&apos;invitation.</p>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {uploading && <p className="muted">Envoi en cours…</p>}
        {error && <div className="alert err" role="alert">{error}</div>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Galerie</h3>
        <p className="muted">
          La <strong>couverture</strong> s&apos;affiche en grand sur la page publique. Le <strong>logo</strong> de
          votre association apparaît sur la page, les billets, les invitations et dans tous les emails. Les photos
          marquées <strong>page publique</strong> forment la galerie « En images » visible par les acheteurs.
        </p>
        {media === null ? (
          <p className="muted">Chargement…</p>
        ) : (
          <MediaGallery
            media={media}
            canDelete={() => true}
            onDelete={(m) => {
              act(() => api(`/api/events/${eventId}/media/${m.id}`, { method: "DELETE" }), "Photo supprimée");
              setMedia((list) => list?.filter((x) => x.id !== m.id) ?? null);
            }}
            coverId={coverId}
            onSetCover={(m) =>
              act(
                () => api(`/api/events/${eventId}/cover`, { method: "PATCH", body: { media_id: m?.id ?? null } }),
                m ? "Image de couverture définie" : "Image de couverture retirée",
              )
            }
            logoId={logoId}
            onSetLogo={(m) =>
              act(
                () => api(`/api/events/${eventId}/logo`, { method: "PATCH", body: { media_id: m?.id ?? null } }),
                m ? "Logo défini" : "Logo retiré",
              )
            }
            onToggleFeatured={(m, featured) => {
              act(
                () => api(`/api/events/${eventId}/media/${m.id}`, { method: "PATCH", body: { featured } }),
                featured ? "Photo ajoutée à la page publique" : "Photo masquée de la page publique",
              );
              setMedia((list) => list?.map((x) => (x.id === m.id ? { ...x, featured: featured ? 1 : 0 } : x)) ?? null);
            }}
          />
        )}
      </div>
    </>
  );
}
