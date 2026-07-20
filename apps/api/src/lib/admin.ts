import type { Context, Next } from "hono";
import type { AppContext, Env } from "../types";
import { nowIso, uuid } from "./crypto";

export type AdminRole = "admin" | "superadmin";

/** Middleware : exige que l'utilisateur authentifié ait le rôle admin ou superadmin. */
export async function requireAdmin(c: Context<AppContext>, next: Next) {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT role, status FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ role: string; status: string }>();
  if (!row || row.status !== "active" || !["admin", "superadmin"].includes(row.role)) {
    return c.json({ error: "Accès administrateur requis" }, 403);
  }
  c.set("adminRole", row.role as AdminRole);
  await next();
}

/** Middleware : exige le rôle superadmin (promotions, changements sensibles). */
export async function requireSuperadmin(c: Context<AppContext>, next: Next) {
  if (c.get("adminRole") !== "superadmin") {
    return c.json({ error: "Réservé au super-administrateur" }, 403);
  }
  await next();
}

/** Enregistre une action administrative dans le journal d'audit. */
export async function logAdminAction(
  env: Env,
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(uuid(), adminId, action, targetType, targetId, details ? JSON.stringify(details) : null, nowIso())
    .run();
}

const SETTINGS_DEFAULTS: Record<string, string> = {
  platform_fee_percent: "5",
  platform_fee_fixed_cents: "99",
};

/** Lit un paramètre plateforme : base D1 (modifiable en admin) → variable d'env → défaut codé en dur. */
export async function getSetting(env: Env, key: string): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM platform_settings WHERE key = ?").bind(key).first<{ value: string }>();
  if (row) return row.value;
  if (key === "platform_fee_percent" && env.PLATFORM_FEE_PERCENT) return env.PLATFORM_FEE_PERCENT;
  if (key === "platform_fee_fixed_cents" && env.PLATFORM_FEE_FIXED_CENTS) return env.PLATFORM_FEE_FIXED_CENTS;
  return SETTINGS_DEFAULTS[key] ?? "";
}

export async function setSetting(env: Env, key: string, value: string, adminId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(key, value, nowIso(), adminId)
    .run();
}
