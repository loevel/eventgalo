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
