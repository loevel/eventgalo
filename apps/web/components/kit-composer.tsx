"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Sparkles, RefreshCw, Download, Package } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { bitmapFromBase64, bitmapFromUrl, resolveFont } from "@/lib/compose";
import { buildContent, ensureFonts, renderEventVisual, type VisualLayout } from "@/lib/event-visual";
import { makeZip, type ZipEntry } from "@/lib/zip";
import type { FlyerCategory, FlyerEvent } from "./flyer-composer";

/**
 * Formats du kit de communication. Les dimensions suivent les recommandations
 * des plateformes ; `qr` est faux là où un code à scanner n'a pas de sens —
 * dans un courriel ou une vignette de partage, le lien est déjà cliquable.
 */
const KIT_FORMATS = [
  { id: "facebook", label: "Couverture d'événement Facebook", w: 1920, h: 1005, file: "couverture-facebook", qr: true },
  { id: "story", label: "Story / statut", w: 1080, h: 1920, file: "story", qr: true },
  { id: "portrait", label: "Publication portrait", w: 1080, h: 1350, file: "publication-portrait", qr: true },
  { id: "carre", label: "Publication carrée", w: 1080, h: 1080, file: "publication-carree", qr: true },
  { id: "partage", label: "Vignette de partage", w: 1200, h: 630, file: "vignette-partage", qr: false },
  { id: "courriel", label: "Bannière de courriel", w: 1200, h: 400, file: "banniere-courriel", qr: false },
] as const;

type KitId = (typeof KIT_FORMATS)[number]["id"];
type Mood = "gala" | "festif" | "chaleureux" | "epure";
type Source = "ia" | "couverture" | "aucun";

const MOOD_LABELS: Record<Mood, string> = {
  gala: "Gala",
  festif: "Festif",
  chaleureux: "Chaleureux",
  epure: "Épuré",
};

const LAYOUT_LABELS: Record<VisualLayout, string> = {
  photo: "Photo pleine page",
  affiche: "Affiche à bandeau",
};

interface Render {
  id: KitId;
  url: string;
  blob: Blob;
}

export function KitComposer({
  event, categories, webOrigin,
}: {
  event: FlyerEvent;
  categories: FlyerCategory[];
  webOrigin: string;
}) {
  const bgRef = useRef<ImageBitmap | null>(null);
  const logoRef = useRef<ImageBitmap | null>(null);
  const qrRef = useRef<ImageBitmap | null>(null);
  // Les URL d'objet doivent être révoquées à la main : sans ça, chaque rendu
  // laisse fuir plusieurs mégaoctets de blobs dans l'onglet.
  const urlsRef = useRef<string[]>([]);

  const [layout, setLayout] = useState<VisualLayout>("photo");
  const [mood, setMood] = useState<Mood>("gala");
  const [source, setSource] = useState<Source>("aucun");
  const [hint, setHint] = useState("");
  const [kicker, setKicker] = useState(event.community_tag ?? "");
  const [chosen, setChosen] = useState<Set<KitId>>(() => new Set(KIT_FORMATS.map((f) => f.id)));
  const [renders, setRenders] = useState<Render[]>([]);
  const [assets, setAssets] = useState(0);
  const [busy, setBusy] = useState<null | "ia" | "couverture" | "rendu" | "zip">(null);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = `${webOrigin || "https://eventgalo.com"}/e/${event.public_slug}`;
  const shortUrl = publicUrl.replace(/^https?:\/\//, "");

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

  useEffect(() => {
    if (!event.logo_media_id) return;
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

  // Libère les blobs du rendu précédent quand le composant disparaît.
  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const renderAll = useCallback(async () => {
    const formats = KIT_FORMATS.filter((f) => chosen.has(f.id));
    if (formats.length === 0) {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
      setRenders([]);
      return;
    }
    setBusy("rendu");
    try {
      const display = resolveFont("--font-display", "Georgia, serif");
      const sans = resolveFont("--font-sans", "system-ui, sans-serif");
      await ensureFonts(display, sans);
      const content = buildContent(event, categories, kicker, shortUrl);

      const produced: Render[] = [];
      for (const f of formats) {
        const canvas = document.createElement("canvas");
        canvas.width = f.w;
        canvas.height = f.h;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        renderEventVisual(
          ctx,
          content,
          { background: bgRef.current, logo: logoRef.current, qr: qrRef.current },
          { width: f.w, height: f.h, layout, display, sans, showQr: f.qr },
        );
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
        if (blob) produced.push({ id: f.id, url: URL.createObjectURL(blob), blob });
      }

      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = produced.map((p) => p.url);
      setRenders(produced);
    } finally {
      setBusy(null);
    }
  }, [chosen, event, categories, kicker, shortUrl, layout]);

  useEffect(() => {
    void renderAll();
  }, [renderAll, assets]);

  async function generate() {
    setBusy("ia");
    setError(null);
    try {
      const res = await api<{ image: string }>(`/api/events/${event.id}/flyer/background`, {
        method: "POST",
        body: { format: "kit", mood, hint },
      });
      bgRef.current = await bitmapFromBase64(res.image);
      setSource("ia");
      setAssets((n) => n + 1);
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
    try {
      bgRef.current = await bitmapFromUrl(`${API_BASE}/api/public/media/${event.cover_media_id}/file`);
      setSource("couverture");
      setAssets((n) => n + 1);
    } catch {
      setError("Photo de couverture illisible.");
    } finally {
      setBusy(null);
    }
  }

  function clearBackground() {
    bgRef.current = null;
    setSource("aucun");
    setAssets((n) => n + 1);
  }

  function toggle(id: KitId) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // Révocation différée : Safari lit encore l'objet après le clic.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadZip() {
    setBusy("zip");
    setError(null);
    try {
      const entries: ZipEntry[] = [];
      for (const r of renders) {
        const f = KIT_FORMATS.find((k) => k.id === r.id);
        if (!f) continue;
        const buf = new Uint8Array(await r.blob.arrayBuffer());
        entries.push({ name: `kit-${event.public_slug}/${f.file}-${f.w}x${f.h}.jpg`, data: buf });
      }
      if (entries.length === 0) throw new Error("Aucun visuel à regrouper");
      saveBlob(makeZip(entries), `kit-${event.public_slug}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive impossible");
    } finally {
      setBusy(null);
    }
  }

  const chip = (active: boolean) => (active ? "btn-sm btn-accent" : "btn-sm btn-ghost");
  const poids = renders.reduce((sum, r) => sum + r.blob.size, 0);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Package size={18} /> Kit de communication
      </h3>
      <p className="muted">
        Un seul réglage, tous les formats dont vous avez besoin pour annoncer l&apos;événement.
        Le titre, la date, le lieu et le prix viennent de votre fiche ; seul le fond est généré.
      </p>

      {error && <div className="alert err" role="alert">{error}</div>}

      <label htmlFor="kit-kicker">Surtitre</label>
      <input
        id="kit-kicker"
        value={kicker}
        onChange={(e) => setKicker(e.target.value)}
        placeholder={event.type === "ticketed" ? "Billetterie" : "Vous êtes invité"}
        maxLength={40}
      />

      <label>Mise en page</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(Object.keys(LAYOUT_LABELS) as VisualLayout[]).map((l) => (
          <button key={l} type="button" className={chip(l === layout)} onClick={() => setLayout(l)} aria-pressed={l === layout}>
            {LAYOUT_LABELS[l]}
          </button>
        ))}
      </div>

      <label>Fond commun à tous les formats</label>
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

      <label htmlFor="kit-hint">Que montre le fond généré ?</label>
      <input
        id="kit-hint"
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
        {busy === "ia" ? "Génération…" : source === "ia" ? <>Regénérer le fond <RefreshCw size={15} /></> : <>Générer le fond <Sparkles size={15} /></>}
      </button>

      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--line)" }} />

      <label>Formats à produire</label>
      <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        {KIT_FORMATS.map((f) => (
          <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, margin: 0 }}>
            <input type="checkbox" checked={chosen.has(f.id)} onChange={() => toggle(f.id)} style={{ width: "auto", margin: 0 }} />
            <span>{f.label}</span>
            <span className="muted" style={{ fontSize: 13 }}>{f.w} × {f.h}</span>
          </label>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
          alignItems: "end",
        }}
      >
        {renders.map((r) => {
          const f = KIT_FORMATS.find((k) => k.id === r.id);
          if (!f) return null;
          return (
            <figure key={r.id} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- rendu local en mémoire, next/image ne s'applique pas */}
              <img
                src={r.url}
                alt={f.label}
                style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }}
              />
              <figcaption className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {f.label}
                <br />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ marginTop: 4 }}
                  onClick={() => saveBlob(r.blob, `${f.file}-${f.w}x${f.h}.jpg`)}
                >
                  <Download size={13} /> Télécharger
                </button>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16 }}>
        <button type="button" className="btn btn-gold" onClick={downloadZip} disabled={busy !== null || renders.length === 0}>
          <Package size={15} /> {busy === "zip" ? "…" : `Tout télécharger (${renders.length} fichiers)`}
        </button>
        {busy === "rendu" && <span className="muted">Composition en cours…</span>}
        {poids > 0 && busy === null && (
          <span className="muted">{Math.round(poids / 1024)} Ko au total</span>
        )}
      </div>
    </div>
  );
}
