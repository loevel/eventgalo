"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Sparkles, RefreshCw, Download, ImagePlus } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { bitmapFromBase64, bitmapFromUrl, drawCover, fit, resolveFont, roundedRect } from "@/lib/compose";

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

/** « samedi 14 novembre 2026 » — la casse initiale est ajoutée pour un titre. */
function longDate(iso: string): string {
  const d = new Intl.DateTimeFormat("fr-CA", { dateStyle: "full" }).format(new Date(iso));
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Ligne de prix du dépliant. Un événement privé n'a pas de billetterie : afficher
 * « Gratuit » y serait trompeur, on annonce donc l'invitation.
 */
function priceLine(ev: FlyerEvent, categories: FlyerCategory[]): string {
  if (ev.type !== "ticketed") return "Sur invitation";
  if (categories.length === 0) return "";
  const min = Math.min(...categories.map((c) => c.price_cents));
  if (min === 0) return "Entrée gratuite · réservation requise";
  const currency = categories[0]?.currency ?? "CAD";
  const amount = new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(min / 100);
  return categories.length > 1 ? `Billets à partir de ${amount}` : `Billets ${amount}`;
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

    const { w: W, h: H } = FORMATS[format];
    canvas.width = W;
    canvas.height = H;
    // Toutes les tailles sont exprimées pour une largeur de 1080 puis mises à
    // l'échelle : un même gabarit sert du carré Instagram à l'impression A4.
    const u = W / 1080;
    const px = (n: number) => Math.round(n * u);

    const display = resolveFont("--font-display", "Georgia, serif");
    const sans = resolveFont("--font-sans", "system-ui, sans-serif");
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load(`700 ${px(96)}px ${display}`),
        document.fonts.load(`600 ${px(40)}px ${sans}`),
        document.fonts.load(`400 ${px(30)}px ${sans}`),
      ]).catch(() => undefined);
    }

    const pad = px(84);
    const qrSize = px(figureQr(format));
    const qrPad = px(16);
    const qrBox = qrSize + qrPad * 2;
    const gap = px(40);
    const colWidth = qrRef.current ? W - pad * 2 - qrBox - gap : W - pad * 2;

    /* ------------------------------ Bloc de texte ------------------------------ */

    const kickerText = (kicker || (event.type === "ticketed" ? "Billetterie" : "Vous êtes invité")).trim();
    const dateText = `${longDate(event.starts_at)} · ${timeOf(event.starts_at)}`;
    const venueText = (event.venue ?? "").trim();
    const addressText = (event.address ?? "").trim();
    const price = priceLine(event, categories);

    ctx.textAlign = "left";
    const title = fit(
      ctx,
      event.title,
      display,
      700,
      [px(96), px(84), px(74), px(64), px(56)],
      colWidth,
      3,
    );

    /*
     * Chaque ligne porte sa hauteur de corps et l'espace qui la précède, et la
     * ligne de base avance de `lead + size`. Un modèle à interligne fixe par
     * ligne ne marche pas ici : le surtitre en 26 px précède un titre en 96 px,
     * et son interligne à lui faisait passer le titre par-dessus.
     */
    type Row =
      | { kind: "text"; text: string; font: string; color: string; size: number; lead: number; spacing?: string }
      | { kind: "rule"; size: number; lead: number };
    const rows: Row[] = [];
    if (kickerText) {
      rows.push({
        kind: "text",
        text: kickerText.toUpperCase(),
        font: `600 ${px(26)}px ${sans}`,
        color: "#d9a662",
        size: px(26),
        lead: 0,
        spacing: `${px(3)}px`,
      });
    }
    title.lines.forEach((line, i) => {
      rows.push({
        kind: "text",
        text: line,
        font: `700 ${title.size}px ${display}`,
        color: "#ffffff",
        size: title.size,
        lead: i === 0 ? px(22) : Math.round(title.size * 0.1),
      });
    });
    rows.push({ kind: "rule", size: Math.max(2, px(3)), lead: px(38) });
    rows.push({ kind: "text", text: dateText, font: `600 ${px(38)}px ${sans}`, color: "#ffffff", size: px(38), lead: px(30) });
    if (venueText) {
      rows.push({ kind: "text", text: venueText, font: `500 ${px(33)}px ${sans}`, color: "#e8d9c2", size: px(33), lead: px(12) });
    }
    if (addressText) {
      rows.push({ kind: "text", text: addressText, font: `400 ${px(27)}px ${sans}`, color: "#b3a695", size: px(27), lead: px(10) });
    }
    if (price) {
      rows.push({ kind: "text", text: price, font: `600 ${px(31)}px ${sans}`, color: "#d9a662", size: px(31), lead: px(20) });
    }

    // Réserve sous la dernière ligne de base, pour les jambages descendants.
    const descender = px(12);
    const blockHeight = rows.reduce((sum, r) => sum + r.lead + r.size, 0) + descender;
    const footerH = px(56);
    const bottom = H - pad;
    // Le bloc de texte et le cartouche QR sont calés sur la même ligne de base
    // basse, chacun dans sa colonne : ils ne peuvent donc pas se chevaucher.
    let y = bottom - footerH - blockHeight;

    /* ------------------------------- Fond ------------------------------------- */

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#120f0c";
    ctx.fillRect(0, 0, W, H);
    // Sans image, un aplat noir donne un dépliant terne : on pose une lueur
    // chaude très discrète, dans les tons de la marque.
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.9);
    glow.addColorStop(0, "rgba(143,64,9,0.34)");
    glow.addColorStop(0.55, "rgba(60,32,12,0.16)");
    glow.addColorStop(1, "rgba(18,15,12,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const bg = bgRef.current;
    // La coupe du gabarit « affiche » suit le haut réel du contenu au lieu d'une
    // fraction fixe de la hauteur : sur une story, une coupe à 56 % laissait une
    // large bande noire vide entre l'image et le texte.
    const contentTop = Math.min(y, qrRef.current ? bottom - footerH - qrBox : H);
    const splitY =
      layout === "affiche"
        ? Math.round(Math.min(Math.max(contentTop - px(64), H * 0.34), H * 0.78))
        : H;
    if (bg) drawCover(ctx, bg, 0, 0, W, splitY);

    if (layout === "affiche") {
      // Fondu court sous l'image pour que la coupe ne soit pas une ligne nette.
      const seam = ctx.createLinearGradient(0, splitY - px(120), 0, splitY);
      seam.addColorStop(0, "rgba(18,15,12,0)");
      seam.addColorStop(1, "rgba(18,15,12,1)");
      ctx.fillStyle = seam;
      ctx.fillRect(0, splitY - px(120), W, px(120));
      ctx.fillStyle = "#120f0c";
      ctx.fillRect(0, splitY, W, H - splitY);
    } else if (bg) {
      // Voile progressif : le texte occupe le bas, l'image reste lisible en haut.
      const scrim = ctx.createLinearGradient(0, H * 0.3, 0, H);
      scrim.addColorStop(0, "rgba(18,15,12,0)");
      scrim.addColorStop(0.45, "rgba(18,15,12,0.72)");
      scrim.addColorStop(1, "rgba(18,15,12,0.97)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);
    }

    /* ------------------------------- Texte ------------------------------------ */

    ctx.shadowColor = layout === "photo" ? "rgba(0,0,0,0.5)" : "transparent";
    ctx.shadowBlur = layout === "photo" ? px(20) : 0;

    for (const row of rows) {
      y += row.lead + row.size;
      if (row.kind === "rule") {
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#d9a662";
        ctx.fillRect(pad, y - row.size, px(96), row.size);
        ctx.restore();
        continue;
      }
      ctx.font = row.font;
      ctx.fillStyle = row.color;
      ctx.letterSpacing = row.spacing ?? "0px";
      ctx.fillText(row.text, pad, y);
      ctx.letterSpacing = "0px";
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    /* -------------------------------- Code QR --------------------------------- */

    const qr = qrRef.current;
    if (qr) {
      const qx = W - pad - qrBox;
      const qy = bottom - footerH - qrBox;
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, qx, qy, qrBox, qrBox, px(18));
      ctx.fill();
      ctx.drawImage(qr, qx + qrPad, qy + qrPad, qrSize, qrSize);
      ctx.font = `600 ${px(21)}px ${sans}`;
      ctx.fillStyle = "#e8d9c2";
      ctx.textAlign = "center";
      ctx.fillText("Réservez ici", qx + qrBox / 2, qy - px(16));
      ctx.textAlign = "left";
    }

    /* --------------------------------- Pied ----------------------------------- */

    ctx.font = `500 ${px(24)}px ${sans}`;
    ctx.fillStyle = "#8d8377";
    ctx.fillText(shortUrl, pad, bottom);

    /* --------------------------- Logo de l'organisateur ------------------------ */

    const logo = logoRef.current;
    if (logo) {
      const size = px(112);
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      roundedRect(ctx, pad, pad, size, size, px(20));
      ctx.fill();
      ctx.clip();
      drawCover(ctx, logo, pad + px(10), pad + px(10), size - px(20), size - px(20));
      ctx.restore();
    }

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

/** Le code QR occupe une part plus faible d'une story, très haute et étroite. */
function figureQr(format: Format): number {
  return format === "story" ? 176 : 200;
}
