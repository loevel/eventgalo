export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  MEDIA: R2Bucket;
  AI: Ai;
  EVENT_DO: DurableObjectNamespace;
  EMAIL: SendEmail;
  WEB_BASE_URL: string;
  /** URL publique de cette API (pour les images dans les emails). */
  API_BASE_URL?: string;
  ENVIRONMENT: string;
  /** Secret : signature HMAC des QR codes de billets */
  TICKET_SIGNING_KEY: string;
  /** Secrets optionnels */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** Secret de la destination webhook « Comptes connectés » (account.updated). */
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
  /** Frais de service payés par l'acheteur : pourcentage (défaut 5) et fixe par billet en cents (défaut 99). */
  PLATFORM_FEE_PERCENT?: string;
  PLATFORM_FEE_FIXED_CENTS?: string;
  EMAIL_FROM?: string;
  /** Clé secrète Turnstile : protège la demande de lien magique contre l'abus automatisé. */
  TURNSTILE_SECRET_KEY?: string;
  /** DSN Sentry : optionnel, aucune erreur envoyée si absent (dev local, avant configuration du secret). */
  SENTRY_DSN?: string;
}

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
}

export type AppContext = {
  Bindings: Env;
  Variables: { user: AuthedUser; adminRole?: "admin" | "superadmin" };
};
