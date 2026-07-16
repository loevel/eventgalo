const encoder = new TextEncoder();

/** Token URL-safe non prédictible (Web Crypto). */
export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Numéro de billet lisible (Crockford base32, sans caractères ambigus). */
const SERIAL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function randomSerial(len = 10): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += SERIAL_ALPHABET[buf[i] % 32];
  return out;
}

export function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "evenement"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Payload QR : EG1.<ticketId>.<signature tronquée 128 bits> */
export async function buildTicketPayload(secret: string, ticketId: string): Promise<string> {
  const sig = (await hmacHex(secret, `ticket:${ticketId}`)).slice(0, 32);
  return `EG1.${ticketId}.${sig}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Retourne l'id du billet si la signature est valide, sinon null. */
export async function verifyTicketPayload(secret: string, payload: string): Promise<string | null> {
  const parts = payload.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "EG1") return null;
  const [, ticketId, sig] = parts;
  const expected = (await hmacHex(secret, `ticket:${ticketId}`)).slice(0, 32);
  return timingSafeEqual(expected, sig) ? ticketId : null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}
