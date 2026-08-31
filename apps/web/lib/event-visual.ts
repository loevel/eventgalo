/**
 * Moteur de composition des visuels d'événement, partagé par le générateur de
 * dépliants et le kit de communication.
 *
 * Règle commune à ces outils : l'IA ne fournit que le fond, tout le texte est
 * composé ici avec les vraies polices de la marque. Un modèle de diffusion
 * réécrirait de travers une date, un lieu ou un prix — des valeurs qui doivent
 * être exactes.
 */

import { drawCover, fit, roundedRect } from "./compose";

export type VisualLayout = "photo" | "affiche";

export interface VisualEvent {
  title: string;
  starts_at: string;
  venue?: string | null;
  address?: string | null;
  type?: string;
}

export interface VisualCategory {
  price_cents: number;
  currency?: string;
}

export interface VisualContent {
  kicker: string;
  title: string;
  date: string;
  venue: string;
  address: string;
  price: string;
  footer: string;
}

export interface VisualAssets {
  background: ImageBitmap | null;
  logo: ImageBitmap | null;
  qr: ImageBitmap | null;
}

export interface VisualOptions {
  width: number;
  height: number;
  layout: VisualLayout;
  display: string;
  sans: string;
  /** Le code QR n'a pas de sens partout : dans un courriel, le lien est cliquable. */
  showQr?: boolean;
}

const INK = "#120f0c";
const GOLD = "#d9a662";
const CREAM = "#e8d9c2";

/** « Samedi 14 novembre 2026 » — la casse initiale est ajoutée pour un titre. */
function longDate(iso: string): string {
  const d = new Intl.DateTimeFormat("fr-CA", { dateStyle: "full" }).format(new Date(iso));
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Ligne de prix. Un événement privé n'a pas de billetterie : y afficher
 * « Gratuit » serait trompeur, on annonce donc l'invitation.
 */
export function priceLine(ev: VisualEvent, categories: VisualCategory[]): string {
  if (ev.type !== "ticketed") return "Sur invitation";
  if (categories.length === 0) return "";
  const min = Math.min(...categories.map((c) => c.price_cents));
  if (min === 0) return "Entrée gratuite · réservation requise";
  const currency = categories[0]?.currency ?? "CAD";
  const amount = new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(min / 100);
  return categories.length > 1 ? `Billets à partir de ${amount}` : `Billets ${amount}`;
}

export function buildContent(
  ev: VisualEvent,
  categories: VisualCategory[],
  kicker: string,
  footer: string,
): VisualContent {
  return {
    kicker: (kicker || (ev.type === "ticketed" ? "Billetterie" : "Vous êtes invité")).trim(),
    title: ev.title,
    date: `${longDate(ev.starts_at)} · ${timeOf(ev.starts_at)}`,
    venue: (ev.venue ?? "").trim(),
    address: (ev.address ?? "").trim(),
    price: priceLine(ev, categories),
    footer,
  };
}

/** Précharge les corps de police utilisés, sans quoi le premier rendu retombe sur le repli. */
export async function ensureFonts(display: string, sans: string): Promise<void> {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`700 96px ${display}`),
    document.fonts.load(`600 40px ${sans}`),
    document.fonts.load(`400 30px ${sans}`),
  ]).catch(() => undefined);
}

type Row =
  | { kind: "text"; text: string; font: string; color: string; size: number; lead: number; spacing?: string }
  | { kind: "rule"; size: number; lead: number };

/**
 * Construit le bloc de texte à une échelle donnée.
 *
 * Chaque ligne porte sa hauteur de corps et l'espace qui la précède, et la ligne
 * de base avance de `lead + size`. Un interligne fixe par ligne ne marche pas
 * ici : un surtitre en 26 px précède un titre en 96 px, et son propre interligne
 * ferait passer le titre par-dessus.
 */
function buildRows(
  ctx: CanvasRenderingContext2D,
  content: VisualContent,
  opts: VisualOptions,
  u: number,
  colWidth: number,
): { rows: Row[]; height: number } {
  const px = (n: number) => Math.round(n * u);
  const { display, sans } = opts;
  const rows: Row[] = [];

  ctx.textAlign = "left";
  const title = fit(ctx, content.title, display, 700, [px(96), px(84), px(74), px(64), px(56)], colWidth, 3);

  if (content.kicker) {
    rows.push({
      kind: "text",
      text: content.kicker.toUpperCase(),
      font: `600 ${px(26)}px ${sans}`,
      color: GOLD,
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
  rows.push({ kind: "text", text: content.date, font: `600 ${px(38)}px ${sans}`, color: "#ffffff", size: px(38), lead: px(30) });
  if (content.venue) {
    rows.push({ kind: "text", text: content.venue, font: `500 ${px(33)}px ${sans}`, color: CREAM, size: px(33), lead: px(12) });
  }
  if (content.address) {
    rows.push({ kind: "text", text: content.address, font: `400 ${px(27)}px ${sans}`, color: "#b3a695", size: px(27), lead: px(10) });
  }
  if (content.price) {
    rows.push({ kind: "text", text: content.price, font: `600 ${px(31)}px ${sans}`, color: GOLD, size: px(31), lead: px(20) });
  }

  // Réserve sous la dernière ligne de base, pour les jambages descendants.
  const height = rows.reduce((sum, r) => sum + r.lead + r.size, 0) + px(12);
  return { rows, height };
}

/**
 * Compose un visuel d'événement complet dans le contexte fourni.
 *
 * L'échelle typographique est dérivée de la plus petite dimension utile, puis
 * réduite tant que le bloc dépasse la hauteur disponible : le même gabarit doit
 * tenir de la story 9:16 à la bannière de courriel très large et très basse.
 */
export function renderEventVisual(
  ctx: CanvasRenderingContext2D,
  content: VisualContent,
  assets: VisualAssets,
  opts: VisualOptions,
): void {
  const W = opts.width;
  const H = opts.height;
  const paysage = W > H;
  const qr = opts.showQr === false ? null : assets.qr;

  // En portrait la largeur commande ; en paysage c'est la hauteur, sinon un
  // format très large produirait un titre plus haut que le visuel lui-même.
  let u = paysage ? H / 760 : W / 1080;

  let rows: Row[] = [];
  let blockHeight = 0;
  let pad = 0;
  let qrBox = 0;
  let colWidth = 0;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const px = (n: number) => Math.round(n * u);
    pad = px(84);
    const qrSize = px(paysage ? 190 : 200);
    qrBox = qr ? qrSize + px(16) * 2 : 0;
    const gap = qr ? px(40) : 0;
    const available = W - pad * 2 - qrBox - gap;
    colWidth = paysage ? Math.min(available, Math.round(W * 0.56)) : available;

    const built = buildRows(ctx, content, opts, u, colWidth);
    rows = built.rows;
    blockHeight = built.height;

    const needed = blockHeight + px(56) + pad * 2;
    if (needed <= H || u < 0.18) break;
    u *= 0.88;
  }

  const px = (n: number) => Math.round(n * u);
  const footerH = px(56);
  const bottom = H - pad;
  // En portrait le bloc est calé en bas ; en paysage il est centré verticalement,
  // la hauteur étant la ressource rare.
  let y = paysage
    ? Math.max(pad, Math.round((H - blockHeight) / 2))
    : bottom - footerH - blockHeight;
  const contentTop = y;

  /* ------------------------------- Fond ------------------------------------- */

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  // Sans image, un aplat noir donne un visuel terne : on pose une lueur chaude
  // très discrète, dans les tons de la marque.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.max(W, H) * 0.9);
  glow.addColorStop(0, "rgba(143,64,9,0.34)");
  glow.addColorStop(0.55, "rgba(60,32,12,0.16)");
  glow.addColorStop(1, "rgba(18,15,12,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const bg = assets.background;
  const ink = (a: number) => `rgba(18,15,12,${a})`;

  if (opts.layout === "affiche") {
    // La coupe suit le haut réel du contenu plutôt qu'une fraction fixe : à
    // hauteur fixe, une story montrait une large bande vide sous l'image.
    if (paysage) {
      const splitX = Math.round(Math.min(Math.max(pad + colWidth + px(56), W * 0.38), W * 0.72));
      if (bg) drawCover(ctx, bg, splitX, 0, W - splitX, H);
      const seam = ctx.createLinearGradient(splitX, 0, splitX + px(140), 0);
      seam.addColorStop(0, ink(1));
      seam.addColorStop(1, ink(0));
      ctx.fillStyle = seam;
      ctx.fillRect(splitX, 0, px(140), H);
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, splitX, H);
    } else {
      const anchor = Math.min(contentTop, qr ? bottom - footerH - qrBox : H);
      const splitY = Math.round(Math.min(Math.max(anchor - px(64), H * 0.34), H * 0.78));
      if (bg) drawCover(ctx, bg, 0, 0, W, splitY);
      const seam = ctx.createLinearGradient(0, splitY - px(120), 0, splitY);
      seam.addColorStop(0, ink(0));
      seam.addColorStop(1, ink(1));
      ctx.fillStyle = seam;
      ctx.fillRect(0, splitY - px(120), W, px(120));
      ctx.fillStyle = INK;
      ctx.fillRect(0, splitY, W, H - splitY);
    }
  } else {
    if (bg) drawCover(ctx, bg, 0, 0, W, H);
    if (bg) {
      // Voile progressif, orienté selon la place qu'occupe le texte : par le bas
      // en portrait, par la gauche en paysage.
      const scrim = paysage
        ? ctx.createLinearGradient(0, 0, W, 0)
        : ctx.createLinearGradient(0, H * 0.3, 0, H);
      if (paysage) {
        scrim.addColorStop(0, ink(0.93));
        scrim.addColorStop(0.45, ink(0.8));
        scrim.addColorStop(0.78, ink(0.22));
        scrim.addColorStop(1, ink(0));
      } else {
        scrim.addColorStop(0, ink(0));
        scrim.addColorStop(0.45, ink(0.72));
        scrim.addColorStop(1, ink(0.97));
      }
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ------------------------------- Texte ------------------------------------ */

  const ombre = opts.layout === "photo" && Boolean(bg);
  ctx.shadowColor = ombre ? "rgba(0,0,0,0.5)" : "transparent";
  ctx.shadowBlur = ombre ? px(20) : 0;

  for (const row of rows) {
    y += row.lead + row.size;
    if (row.kind === "rule") {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = GOLD;
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

  if (qr) {
    const qrPad = px(16);
    const qrSize = qrBox - qrPad * 2;
    const qx = W - pad - qrBox;
    const qy = paysage ? Math.round((H - qrBox) / 2) : bottom - footerH - qrBox;
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qx, qy, qrBox, qrBox, px(18));
    ctx.fill();
    ctx.drawImage(qr, qx + qrPad, qy + qrPad, qrSize, qrSize);
    ctx.font = `600 ${px(21)}px ${opts.sans}`;
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.fillText("Réservez ici", qx + qrBox / 2, qy - px(16));
    ctx.textAlign = "left";
  }

  /* --------------------------------- Pied ----------------------------------- */

  if (content.footer) {
    ctx.font = `500 ${px(24)}px ${opts.sans}`;
    ctx.fillStyle = "#8d8377";
    ctx.fillText(content.footer, pad, bottom);
  }

  /* --------------------------- Logo de l'organisateur ------------------------ */

  if (assets.logo) {
    const size = px(112);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundedRect(ctx, pad, pad, size, size, px(20));
    ctx.fill();
    ctx.clip();
    drawCover(ctx, assets.logo, pad + px(10), pad + px(10), size - px(20), size - px(20));
    ctx.restore();
  }
}
