"use client";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("eg_session");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("eg_session", token);
  else localStorage.removeItem("eg_session");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const isForm = options.body instanceof FormData;
  // Pas de Content-Type pour FormData : le navigateur ajoute la boundary multipart
  const headers: Record<string, string> = isForm ? {} : { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: isForm ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  return data;
}

export function formatPrice(cents: number, currency = "CAD"): string {
  if (cents === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}
