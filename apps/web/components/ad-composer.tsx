"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

/** Format d'affichage du bandeau de la page d'accueil (.ad-card img : 220x110). */
const W = 1024;
const H = 512;
const THUMB_W = 220;
const THUMB_H = 110;

type Style = "photo" | "abstrait" | "festif" | "epure";
type Template = "gauche" | "centre" | "bas";

const STYLE_LABELS: Record<Style, string> = {
  photo: "Photo",
  abstrait: "Abstrait",
  festif: "Festif",
  epure: "Épuré",
};

const TEMPLATE_LABELS: Record<Template, string> = {
  gauche: "Texte à gauche",
  centre: "Texte centré",
  bas: "Texte en bas",
};

/**
 * Résout la vraie famille de police derrière une variable CSS. next/font génère
 * un nom de famille haché (`__Fraunces_abc123`) : sans cette résolution, le
 * canvas retomberait silencieusement sur une police système.
 */
function resolveFont(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

/** Coupe un texte en lignes qui tiennent dans `maxWidth`, au plus `maxLines`. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; truncated: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i += 1) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines) return { lines, truncated: true };
    }
  }
  if (current) lines.push(current);
  // Un mot seul plus large que la colonne passe quand même : il faut le signaler.
  const overflows = lines.some((line) => ctx.measureText(line).width > maxWidth);
  return { lines, truncated: overflows };
}

/**
 * Compose un bloc de texte qui tient dans la colonne : on réduit d'abord le
 * corps, et seulement en dernier recours on coupe avec une ellipse. Sans ça, une
 * accroche un peu longue était tronquée en silence — l'annonceur payait pour un
 * bandeau amputé sans l'avoir vu.
 */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  sizes: number[],
  maxWidth: number,
  maxLines: number,
): { lines: string[]; size: number } {
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${family}`;
    const { lines, truncated } = wrap(ctx, text, maxWidth, maxLines);
    if (!truncated) return { lines, size };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = `${weight} ${size}px ${family}`;
  const { lines } = wrap(ctx, text, maxWidth, maxLines);
  const last = lines.length - 1;
  if (last >= 0) {
    let clipped = lines[last];
    while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    lines[last] = `${clipped.trimEnd()}…`;
  }
  return { lines, size };
}

export function AdComposer({
  title, sector, onVisual,
}: {
  title: string;
  sector: string;
  onVisual: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<ImageBitmap | null>(null);
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [hint, setHint] = useState("");
  const [style, setStyle] = useState<Style>("photo");
  const [template, setTemplate] = useState<Template>("gauche");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [subTooSmall, setSubTooSmall] = useState(false);
  const [applied, setApplied] = useState(false);
  const [hasBackground, setHasBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'accroche par défaut suit le titre de l'annonce tant qu'elle n'a pas été modifiée.
  const effectiveHeadline = headline || title || "Votre entreprise";

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const display = resolveFont("--font-display", "Georgia, serif");
    const sans = resolveFont("--font-sans", "system-ui, sans-serif");
    // Sans cette attente, le premier rendu utilise la police de repli.
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load(`700 64px ${display}`),
        document.fonts.load(`500 28px ${sans}`),
      ]).catch(() => undefined);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#120f0c";
    ctx.fillRect(0, 0, W, H);

    const bg = bgRef.current;
    if (bg) {
      // Recadrage « cover » : le modèle rend du carré, le bandeau est en 2:1.
      const scale = Math.max(W / bg.width, H / bg.height);
      const dw = bg.width * scale;
      const dh = bg.height * scale;
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    // Voile dégradé : le texte occupe un peu plus de la moitié de la largeur, le
    // dégradé doit donc rester dense sur toute cette zone avant de s'ouvrir sur
    // la photo. Un dégradé linéaire simple laissait la sous-ligne passer sur des
    // zones claires du fond généré.
    const ink = (a: number) => `rgba(18,15,12,${a})`;
    let scrim: CanvasGradient;
    if (template === "centre") {
      scrim = ctx.createLinearGradient(0, 0, 0, H);
      scrim.addColorStop(0, ink(0.5));
      scrim.addColorStop(0.5, ink(0.68));
      scrim.addColorStop(1, ink(0.5));
    } else if (template === "bas") {
      scrim = ctx.createLinearGradient(0, H * 0.28, 0, H);
      scrim.addColorStop(0, ink(0));
      scrim.addColorStop(0.4, ink(0.5));
      scrim.addColorStop(1, ink(0.92));
    } else {
      scrim = ctx.createLinearGradient(0, 0, W, 0);
      scrim.addColorStop(0, ink(0.92));
      scrim.addColorStop(0.42, ink(0.78));
      scrim.addColorStop(0.72, ink(0.24));
      scrim.addColorStop(1, ink(0));
    }
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);

    const pad = 56;
    const maxWidth = template === "centre" ? W - pad * 2 : W * 0.6;
    ctx.textAlign = template === "centre" ? "center" : "left";
    const x = template === "centre" ? W / 2 : pad;

    // Corps de texte calibrés pour la taille de *diffusion* (220x110), pas pour le
    // master : ce dernier n'est jamais montré tel quel, il est toujours réduit d'un
    // facteur 4,65. Un sous-titre en 28 px ici tombait à 6 px chez le visiteur.
    const head = fit(ctx, effectiveHeadline, display, 700, [72, 62, 54, 46], maxWidth, 2);
    const sub = subline
      ? fit(ctx, subline, sans, 500, [44, 38, 33], maxWidth, 1)
      : { lines: [], size: 44 };
    setSubTooSmall(sub.lines.length > 0 && (sub.size * THUMB_W) / W < 8);

    const headLh = Math.round(head.size * 1.13);
    const subLh = Math.round(sub.size * 1.35);
    const blockHeight = head.lines.length * headLh + (sub.lines.length ? sub.lines.length * subLh + 14 : 0);
    let y = template === "bas"
      ? H - pad - blockHeight + head.size
      : (H - blockHeight) / 2 + head.size * 0.9;

    // Ombre portée : filet de sécurité là où le dégradé s'est déjà ouvert sur la
    // photo, sans avoir à assombrir davantage l'image.
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${head.size}px ${display}`;
    for (const line of head.lines) {
      ctx.fillText(line, x, y);
      y += headLh;
    }
    if (sub.lines.length) {
      y += 10;
      ctx.fillStyle = "#e8d9c2";
      ctx.font = `500 ${sub.size}px ${sans}`;
      for (const line of sub.lines) {
        ctx.fillText(line, x, y);
        y += subLh;
      }
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Miniature à la taille réelle du bandeau : dessinée ici, après la composition,
    // pour qu'elle ne puisse jamais montrer un état précédent du grand canvas.
    const thumb = thumbRef.current?.getContext("2d");
    if (thumb) {
      thumb.clearRect(0, 0, THUMB_W, THUMB_H);
      thumb.drawImage(canvas, 0, 0, THUMB_W, THUMB_H);
    }

    setReady(true);
    setApplied(false);
  }, [effectiveHeadline, subline, template]);

  useEffect(() => {
    void draw();
  }, [draw]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ image: string }>("/api/company/ads/ai/background", {
        method: "POST",
        body: { style, hint, sector: sector || null },
      });
      // createImageBitmap plutôt qu'un HTMLImageElement : decode() sur une image
      // détachée du document ne se résout pas de façon fiable, ce qui laissait
      // le bouton bloqué sur « Génération… » et le fond jamais dessiné.
      const bytes = Uint8Array.from(atob(res.image), (ch) => ch.charCodeAt(0));
      bgRef.current = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      setHasBackground(true);
      await draw();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setBusy(false);
    }
  }

  function use() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onVisual(new File([blob], "bandeau.jpg", { type: "image/jpeg" }));
        // La confirmation du formulaire est tout en haut de la page ; l'utilisateur
        // qui vient de cliquer est en bas, dans le compositeur. Sans ce retour local,
        // rien ne bouge à l'écran et le clic semble sans effet.
        setApplied(true);
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Sparkles size={18} /> Créer le visuel avec l&apos;IA
      </h3>
      <p className="muted">
        L&apos;IA génère le fond ; votre accroche est composée par-dessus avec les polices d&apos;EventGalo,
        pour qu&apos;elle reste nette et sans faute.
      </p>

      {error && <div className="alert err" role="alert">{error}</div>}

      <label htmlFor="ad-hint">Que montre le visuel ?</label>
      <input
        id="ad-hint"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="ex. buffet de traiteur africain, salle de réception"
        maxLength={200}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        {(Object.keys(STYLE_LABELS) as Style[]).map((s) => (
          <button
            key={s}
            type="button"
            className={s === style ? "btn-sm btn-accent" : "btn-sm btn-ghost"}
            onClick={() => setStyle(s)}
            aria-pressed={s === style}
          >
            {STYLE_LABELS[s]}
          </button>
        ))}
      </div>

      <button type="button" className="btn-accent" onClick={generate} disabled={busy}>
        {busy ? "Génération…" : hasBackground ? <>Regénérer le fond <RefreshCw size={15} /></> : "Générer le fond"}
      </button>

      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--line)" }} />

      <label htmlFor="ad-headline">Accroche</label>
      <input
        id="ad-headline"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder={title || "Votre entreprise"}
        maxLength={60}
      />
      <label htmlFor="ad-subline">Sous-titre (optionnel)</label>
      <input
        id="ad-subline"
        value={subline}
        onChange={(e) => setSubline(e.target.value)}
        placeholder="ex. Montréal · devis gratuit"
        maxLength={80}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        {(Object.keys(TEMPLATE_LABELS) as Template[]).map((t) => (
          <button
            key={t}
            type="button"
            className={t === template ? "btn-sm btn-accent" : "btn-sm btn-ghost"}
            onClick={() => setTemplate(t)}
            aria-pressed={t === template}
          >
            {TEMPLATE_LABELS[t]}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: "100%", maxWidth: 480, aspectRatio: "2 / 1", borderRadius: 12, border: "1px solid var(--line)" }}
        aria-label="Aperçu du bandeau"
      />

      <p className="muted" style={{ marginTop: 10 }}>
        Aperçu à la taille réelle du bandeau de la page d&apos;accueil :
      </p>
      {subTooSmall && (
        <p className="muted" style={{ marginTop: 0, color: "var(--accent)" }}>
          Votre sous-titre sera illisible à cette taille : raccourcissez-le (une vingtaine de
          caractères) ou retirez-le.
        </p>
      )}
      <canvas
        ref={thumbRef}
        width={THUMB_W}
        height={THUMB_H}
        style={{ borderRadius: 10, border: "1px solid var(--line)" }}
        aria-hidden="true"
      />

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-accent" onClick={use} disabled={!ready}>
          Utiliser ce visuel
        </button>
        {applied && (
          <span className="muted" role="status">
            ✓ Appliqué à l&apos;annonce — remontez pour payer et diffuser.
          </span>
        )}
      </div>
    </div>
  );
}
