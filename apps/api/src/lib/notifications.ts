import type { Env } from "../types";
import { uuid } from "./crypto";

/** Notification in-app pour un organisateur — toujours en miroir d'un email déjà envoyé. */
export async function createNotification(
  env: Env,
  userId: string,
  opts: { type: string; title: string; body?: string | null; link?: string | null },
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(uuid(), userId, opts.type, opts.title, opts.body ?? null, opts.link ?? null)
    .run();
}
