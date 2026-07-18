export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  MEDIA: R2Bucket;
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
  EMAIL_FROM?: string;
}

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
}

export type AppContext = {
  Bindings: Env;
  Variables: { user: AuthedUser };
};
