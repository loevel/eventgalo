/**
 * Primitives de composition de texte sur canvas, partagées par les générateurs
 * de visuels (bandeau publicitaire, dépliant d'événement).
 *
 * Principe commun à ces outils : l'IA ne produit que le fond, tout le texte est
 * composé ici avec les vraies polices de la marque. Les modèles de diffusion
 * écrivent des mots inventés, ce qui est inacceptable sur un visuel qui porte
 * une date, un lieu et un prix.
 */

/**
 * Résout la vraie famille de police derrière une variable CSS. next/font génère
 * un nom de famille haché (`__Fraunces_abc123`) : sans cette résolution, le
 * canvas retomberait silencieusement sur une police système.
 */
export function resolveFont(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

/** Coupe un texte en lignes qui tiennent dans `maxWidth`, au plus `maxLines`. */
export function wrap(
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
 * corps, et seulement en dernier recours on coupe avec une ellipse. Sans ça, un
 * titre un peu long était tronqué en silence — l'utilisateur diffusait un visuel
 * amputé sans l'avoir vu.
 */
export function fit(
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

/**
 * Décode une image base64 renvoyée par Workers AI.
 *
 * `createImageBitmap` plutôt qu'un `HTMLImageElement` : `decode()` sur une image
 * détachée du document ne se résout pas de façon fiable, ce qui laissait les
 * boutons bloqués sur « Génération… » et le fond jamais dessiné.
 */
export async function bitmapFromBase64(base64: string): Promise<ImageBitmap> {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
}

/**
 * Charge une image servie par l'API dans un bitmap utilisable au canvas.
 *
 * On passe par `fetch` + `createImageBitmap` plutôt que par un `<img>` : cela
 * force la requête à respecter le CORS de l'API, et évite surtout de « teinter »
 * le canvas — un canvas teinté refuse `toBlob`, donc le téléchargement du
 * visuel échouerait au tout dernier moment.
 */
export async function bitmapFromUrl(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Image indisponible");
  return createImageBitmap(await res.blob());
}

/** Dessine une image en « cover » dans le rectangle donné. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** Rectangle à coins arrondis, pour les cartouches (code QR, pastilles). */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
