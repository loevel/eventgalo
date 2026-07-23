import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon/workerd";
import type { Env } from "../types";

export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_PER_GUEST = 20;
export const MAX_MEDIA_PER_EVENT = 500;

export const MEDIA_LIST_QUERY = `
  SELECT m.id, m.guest_id, m.content_type, m.created_at, m.featured, g.name AS guest_name,
         sp.company_name AS sponsor_name
  FROM media m
  LEFT JOIN guests g ON g.id = m.guest_id
  LEFT JOIN sponsors sp ON sp.id = m.sponsor_id
  WHERE m.event_id = ? ORDER BY m.created_at DESC`;

/** Valide le fichier d'un upload multipart ; retourne un message d'erreur ou null. */
export function validateMediaFile(file: File): string | null {
  if (!ALLOWED_MEDIA_TYPES.includes(file.type)) return "Format non supporté (JPEG, PNG, WebP ou GIF)";
  if (file.size > MAX_MEDIA_BYTES) return "Fichier trop volumineux (max 10 Mo)";
  return null;
}

/* ------------------------- Traitement d'image (upload) --------------------- */

const MAIN_MAX_DIMENSION = 1920;
const THUMB_MAX_DIMENSION = 480;
// Au-delà, on ne retraite pas l'image (risque mémoire WASM) : l'original est stocké tel quel.
const MAX_PIXELS_TO_PROCESS = 40_000_000;
/** Suffixe de la clé R2 de la vignette d'un media — dérivé de la clé principale, pas de colonne DB dédiée. */
export const THUMB_SUFFIX = ".thumb";

interface StoredImage {
  bytes: Uint8Array;
  contentType: string;
}

function resizeToMax(image: PhotonImage, maxDimension: number): PhotonImage | null {
  const w = image.get_width();
  const h = image.get_height();
  if (w <= maxDimension && h <= maxDimension) return null;
  const scale = maxDimension / Math.max(w, h);
  return resize(image, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), SamplingFilter.Lanczos3);
}

/**
 * Redimensionne (plafond 1920px) et convertit en WebP l'image d'un upload, et génère une
 * vignette (480px, uniquement si l'image est plus grande). Les GIF (animation) et les images
 * trop grandes pour être décodées sûrement en mémoire WASM sont stockés tels quels. Un échec
 * de traitement retombe toujours sur le fichier original — un upload ne doit jamais échouer
 * à cause d'un bug de traitement d'image.
 */
export async function processImageUpload(file: File): Promise<{ main: StoredImage; thumb: StoredImage | null }> {
  const original = async (): Promise<{ main: StoredImage; thumb: StoredImage | null }> => ({
    main: { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type },
    thumb: null,
  });

  if (file.type === "image/gif") return original();

  let source: PhotonImage | null = null;
  try {
    source = PhotonImage.new_from_byteslice(new Uint8Array(await file.arrayBuffer()));
    if (source.get_width() * source.get_height() > MAX_PIXELS_TO_PROCESS) return original();

    const mainResized = resizeToMax(source, MAIN_MAX_DIMENSION);
    const mainBytes = (mainResized ?? source).get_bytes_webp();
    mainResized?.free();

    const thumbResized = resizeToMax(source, THUMB_MAX_DIMENSION);
    const thumb = thumbResized ? { bytes: thumbResized.get_bytes_webp(), contentType: "image/webp" } : null;
    thumbResized?.free();

    return { main: { bytes: mainBytes, contentType: "image/webp" }, thumb };
  } catch {
    return original();
  } finally {
    source?.free();
  }
}

/** Traite puis stocke une image uploadée (+ vignette éventuelle) sous une clé R2 ; retourne le content-type effectif à persister en base. */
export async function putProcessedImage(env: Env, key: string, file: File): Promise<string> {
  const { main, thumb } = await processImageUpload(file);
  await env.MEDIA.put(key, main.bytes, { httpMetadata: { contentType: main.contentType } });
  if (thumb) {
    await env.MEDIA.put(`${key}${THUMB_SUFFIX}`, thumb.bytes, { httpMetadata: { contentType: thumb.contentType } });
  }
  return main.contentType;
}

/** Supprime une image et sa vignette éventuelle (suppression silencieuse si la vignette n'existe pas). */
export async function deleteProcessedImage(env: Env, key: string): Promise<void> {
  await env.MEDIA.delete([key, `${key}${THUMB_SUFFIX}`]);
}
