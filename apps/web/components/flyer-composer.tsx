"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Sparkles, RefreshCw, Download, ImagePlus } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { bitmapFromBase64, bitmapFromUrl, resolveFont } from "@/lib/compose";
import { buildContent, ensureFonts, renderEventVisual } from "@/lib/event-visual";

/** Formats de diffusion proposés. Les dimensions du fond IA sont côté API. */
const FORMATS = {
  affiche: { w: 1080, h: 1350, label: "Affiche 4:5", note: "Publication Instagram ou Facebook" },
  story: { w: 1080, h: 1920, label: "Story 9:16", note: "Story Instagram, statut WhatsApp" },
  carre: { w: 1080, h: 1080, label: "Carré 1:1", note: "Publication carrée" },
  a4: { w: 1240, h: 1754, label: "Impression A4", note: "Impression à 150 ppp" },
} as const;

type Format = keyof typeof FORMATS;
type Mood = "gala" | "festif" | "chaleureux" | "epure";
type Layout = "photo" | "affiche";
type Source = "ia" | "couverture" | "aucun";

const MOOD_LABELS: Record<Mood, string> = {
  gala: "Gala",
  festif: "Festif",
  chaleureux: "Chaleureux",
  epure: "Épuré",
};

const LAYOUT_LABELS: Record<Layout, string> = {
  photo: "Photo pleine page",
  affiche: "Affiche à bandeau",
};

export interface FlyerEvent {
  id: string;
  title: string;
  starts_at: string;
  venue?: string | null;
  address?: string | null;
  public_slug: string;
  type?: string;
  community_tag?: string | null;
  logo_media_id?: string | null;
  cover_media_id?: string | null;
}

export interface FlyerCategory {
  price_cents: number;
  currency?: string;
}

export function FlyerComposer({
  event, categories, webOrigin,
}: {
  event: FlyerEvent;
  categories: FlyerCategory[];
  webOrigin: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<ImageBitmap | null>(null);
  const logoRef = useRef<ImageBitmap | null>(null);
  const qrRef = useRef<ImageBitmap | null>(null);

  const [format, setFormat] = useState<Format>("affiche");
  const [layout, setLayout] = useState<Layout>("photo");
  const [mood, setMood] = useState<Mood>("gala");
  const [source, setSource] = useState<Source>("aucun");
  // Incrémenté quand une ressource chargée en arrière-plan (code QR, logo)
  // devient disponible : c'est ce qui déclenche le redessin, plutôt que de
  // faire dépendre l'effet de `ready`, que `draw` repositionne lui-même.
  const [assets, setAssets] = useState(0);
  const [hint, setHint] = useState("");
  const [kicker, setKicker] = useState(event.community_tag ?? "");
  const [busy, setBusy] = useState<null | "ia" | "couverture" | "enregistrement">(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const publicUrl = `${webOrigin || "https://eventgalo.com"}/e/${event.public_slug}`;
  const shortUrl = publicUrl.replace(/^https?:\/\//, "");

  /* Code QR vers la fiche publique : c'est ce qui rend le dépliant actionnable. */
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(publicUrl, { margin: 0, width: 480, errorCorrectionLevel: "M" })
      .then((url) => fetch(url))
      .then((r) => r.blob())
      .then(createImageBitmap)
      .then((bmp) => {
        if (!cancelled) {
          qrRef.current = bmp;
          setAssets((n) => n + 1);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  /* Logo de l'organisateur, quand il en a chargé un. */
  useEffect(() => {
    if (!event.logo_media_id) {
      logoRef.current = null;
      return;
    }
    let cancelled = false;
    bitmapFromUrl(`${API_BASE}/api/public/media/${event.logo_media_id}/file`)
      .then((bmp) => {
        if (!cancelled) {
          logoRef.current = bmp;
          setAssets((n) => n + 1);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [event.logo_media_id]);

  /*
   * Fond par défaut : la photo de couverture de l'événement quand il en a une.
   * Chargée d'emblée pour que l'aperçu soit représentatif dès l'ouverture, sans
   * dépenser une génération IA. Le garde sur `bgRef` évite d'écraser un fond
   * généré entre-temps si la requête revient en retard.
   */
  useEffect(() => {
    if (!event.cover_media_id) return;
    let cancelled = false;
    bitmapFromUrl(`${API_BASE}/api/public/media/${event.cover_media_id}/file`)
      .then((bmp) => {
        if (cancelled || bgRef.current) return;
        bgRef.current = bmp;
        setSource("couverture");
        setAssets((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [event.cover_media_id]);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = FORMATS[format];
    canvas.width = w;
    canvas.height = h;

    const display = resolveFont("--font-display", "Georgia, serif");
    const sans = resolveFont("--font-sans", "system-ui, sans-serif");
    await ensureFonts(display, sans);

    renderEventVisual(
      ctx,
      buildContent(event, categories, kicker, shortUrl),
      { background: bgRef.current, logo: logoRef.current, qr: qrRef.current },
      { width: w, height: h, layout, display, sans },
    );

    setReady(true);
  }, [event, categories, format, layout, kicker, shortUrl]);

  useEffect(() => {
    void draw();
  }, [draw, assets]);

  async function generate() {
    setBusy("ia");
    setError(null);
    setFlash(null);
    try {
      const res = await api<{ image: string }>(`/api/events/${event.id}/flyer/background`, {
        method: "POST",
        body: { format, mood, hint },
      });
      bgRef.current = await bitmapFromBase64(res.image);
      setSource("ia");
      await draw();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setBusy(null);
    }
  }

  async function useCover() {
    if (!event.cover_media_id) return;
    setBusy("couverture");
    setError(null);
    setFlash(null);
    try {
      bgRef.current = await bitmapFromUrl(`${API_BASE}/api/public/media/${event.cover_media_id}/file`);
      setSource("couverture");
      await draw();
    } catch {
      setError("Photo de couverture illisible.");
    } finally {
      setBusy(null);
    }
  }

  async function clearBackground() {
    bgRef.current = null;
    setSource("aucun");
    await draw();
  }

  function toBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  async function download() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `depliant-${event.public_slug}-${format}.jpg`;
    a.click();
    // Révocation différée : Safari lit encore l'objet après le clic.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function saveToMedia() {
    setBusy("enregistrement");
    setError(null);
    setFlash(null);
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("Visuel indisponible");
      const fd = new FormData();
      fd.append("file", new File([blob], `depliant-${format}.jpg`, { type: "image/jpeg" }));
      await api(`/api/events/${event.id}/media`, { method: "POST", body: fd });
      setFlash("Dépliant ajouté aux photos de l'événement.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setBusy(null);
    }
  }

  const chip = (active: boolean) => (active ? "btn-sm btn-accent" : "btn-sm btn-ghost");

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Sparkles size={18} /> Dépliant de l&apos;événement
      </h3>
      <p className="muted">
        Le titre, la date, le lieu, le prix et le code QR viennent de votre fiche : ils sont composés
        avec les polices d&apos;EventGalo, jamais dessinés par l&apos;IA. Seul le fond est généré.
      </p>

      {error && <div className="alert err" role="alert">{error}</div>}
      {flash && <div className="alert ok" role="status">{flash}</div>}

      <label>Format</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        {(Object.keys(FORMATS) as Format[]).map((f) => (
          <button key={f} type="button" className={chip(f === format)} onClick={() => setFormat(f)} aria-pressed={f === format}>
            {FORMATS[f].label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{FORMATS[format].note}</p>

      <label>Mise en page</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => (
          <button key={l} type="button" className={chip(l === layout)} onClick={() => setLayout(l)} aria-pressed={l === layout}>
            {LAYOUT_LABELS[l]}
          </button>
        ))}
      </div>

      <label htmlFor="flyer-kicker">Surtitre</label>
      <input
        id="flyer-kicker"
        value={kicker}
        onChange={(e) => setKicker(e.target.value)}
        placeholder={event.type === "ticketed" ? "Billetterie" : "Vous êtes invité"}
        maxLength={40}
      />

      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--line)" }} />

      <label>Fond</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          className={chip(source === "couverture")}
          onClick={useCover}
          disabled={!event.cover_media_id || busy !== null}
          title={event.cover_media_id ? undefined : "Ajoutez d'abord une photo de couverture"}
        >
          Ma photo de couverture
        </button>
        <button type="button" className={chip(source === "aucun")} onClick={clearBackground} disabled={busy !== null}>
          Fond uni
        </button>
      </div>

      <label htmlFor="flyer-hint">Que montre le fond généré ?</label>
      <input
        id="flyer-hint"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="ex. salle de bal, tenue de soirée, orchestre"
        maxLength={200}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        {(Object.keys(MOOD_LABELS) as Mood[]).map((m) => (
          <button key={m} type="button" className={chip(m === mood)} onClick={() => setMood(m)} aria-pressed={m === mood}>
            {MOOD_LABELS[m]}
          </button>
        ))}
      </div>
      <button type="button" className="btn-accent" onClick={generate} disabled={busy !== null}>
        {busy === "ia" ? "Génération…" : source === "ia" ? <>Regénérer le fond <RefreshCw size={15} /></> : "Générer le fond"}
      </button>

      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--line)" }} />

      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          maxWidth: 380,
          aspectRatio: `${FORMATS[format].w} / ${FORMATS[format].h}`,
          borderRadius: 12,
          border: "1px solid var(--line)",
          display: "block",
        }}
        aria-label="Aperçu du dépliant"
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <button type="button" className="btn btn-gold" onClick={download} disabled={!ready}>
          <Download size={15} /> Télécharger
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={saveToMedia} disabled={!ready || busy !== null}>
          <ImagePlus size={15} /> {busy === "enregistrement" ? "…" : "Ajouter aux photos"}
        </button>
      </div>
    </div>
  );
}

