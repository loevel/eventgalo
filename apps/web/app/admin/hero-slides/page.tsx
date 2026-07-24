"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { API_BASE, api } from "@/lib/api";

interface HeroSlide {
  id: string;
  image_key: string | null;
  image_type: string | null;
  caption: string | null;
  position: number;
  active: number;
  created_at: string;
}

export default function AdminHeroSlidesPage() {
  const [slides, setSlides] = useState<HeroSlide[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newCaption, setNewCaption] = useState("");

  const load = useCallback(() => {
    api<{ slides: HeroSlide[] }>("/api/admin/hero-slides")
      .then((r) => setSlides(r.slides))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => load(), [load]);

  async function createSlide(e: React.FormEvent) {
    e.preventDefault();
    setBusy("new");
    setError(null);
    try {
      await api("/api/admin/hero-slides", { method: "POST", body: { caption: newCaption } });
      setNewCaption("");
      load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function uploadImage(id: string, file: File) {
    setBusy(id);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/admin/hero-slides/${id}/image`, { method: "POST", body: fd });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function removeImage(id: string) {
    setBusy(id);
    try {
      await api(`/api/admin/hero-slides/${id}/image`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function updateCaption(slide: HeroSlide, caption: string) {
    setSlides((prev) => prev && prev.map((s) => (s.id === slide.id ? { ...s, caption } : s)));
    try {
      await api(`/api/admin/hero-slides/${slide.id}`, { method: "PATCH", body: { caption } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function toggleActive(slide: HeroSlide) {
    setBusy(slide.id);
    try {
      await api(`/api/admin/hero-slides/${slide.id}`, { method: "PATCH", body: { active: slide.active ? 0 : 1 } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function move(id: string, direction: "up" | "down") {
    setBusy(id);
    try {
      await api(`/api/admin/hero-slides/${id}/move`, { method: "POST", body: { direction } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function remove(slide: HeroSlide) {
    if (!confirm(`Supprimer cette diapositive ${slide.caption ? `« ${slide.caption} » ` : ""}?`)) return;
    setBusy(slide.id);
    try {
      await api(`/api/admin/hero-slides/${slide.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Carrousel de la page d&apos;accueil</h3>
      <p className="muted">
        Diapositives du fond plein écran du hero — image et/ou légende, réordonnables. Une diapositive
        désactivée n&apos;apparaît plus sur le site public.
      </p>
      {error && <div className="alert err">{error}</div>}

      {!slides ? (
        <p className="muted">Chargement…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {slides.map((s, i) => (
            <div
              key={s.id}
              className="card"
              style={{ display: "flex", alignItems: "center", gap: 12, opacity: s.active ? 1 : 0.5 }}
            >
              <div
                style={{
                  width: 90,
                  height: 54,
                  flexShrink: 0,
                  borderRadius: 6,
                  overflow: "hidden",
                  background: "var(--bg-soft, #222)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {s.image_key ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu admin, next/image superflu
                  <img
                    src={`${API_BASE}/api/public/hero-slides/${s.id}/image?thumb=1`}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span className="muted" style={{ fontSize: 11 }}>
                    Sans image
                  </span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  value={s.caption ?? ""}
                  placeholder="Légende (optionnelle)"
                  maxLength={200}
                  onChange={(e) => updateCaption(s, e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <label className="btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <Upload size={14} /> {s.image_key ? "Remplacer" : "Image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: "none" }}
                  disabled={busy === s.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(s.id, file);
                    e.target.value = "";
                  }}
                />
              </label>
              {s.image_key && (
                <button className="btn-sm btn-ghost" disabled={busy === s.id} onClick={() => removeImage(s.id)}>
                  Retirer l&apos;image
                </button>
              )}

              <button
                className="btn-sm btn-ghost"
                disabled={busy === s.id || i === 0}
                onClick={() => move(s.id, "up")}
                aria-label="Monter"
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="btn-sm btn-ghost"
                disabled={busy === s.id || i === slides.length - 1}
                onClick={() => move(s.id, "down")}
                aria-label="Descendre"
              >
                <ArrowDown size={14} />
              </button>

              <button className="btn-sm btn-ghost" disabled={busy === s.id} onClick={() => toggleActive(s)}>
                {s.active ? "Désactiver" : "Activer"}
              </button>

              <button className="btn-sm btn-ghost" disabled={busy === s.id} onClick={() => remove(s)} aria-label="Supprimer">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {slides.length === 0 && <p className="muted">Aucune diapositive — le carrousel affiche la sélection par défaut.</p>}
        </div>
      )}

      <form onSubmit={createSlide} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label>Nouvelle diapositive — légende (optionnelle)</label>
          <input
            value={newCaption}
            maxLength={200}
            onChange={(e) => setNewCaption(e.target.value)}
            placeholder="Ex. : Galas & soirées corporatives"
          />
        </div>
        <button type="submit" className="btn btn-gold" disabled={busy === "new"}>
          {busy === "new" ? "…" : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
