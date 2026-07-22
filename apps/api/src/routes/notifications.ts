import { Hono } from "hono";
import type { AppContext } from "../types";
import { requireAuth } from "../lib/auth";
import { nowIso } from "../lib/crypto";
import { generateNotificationDigest } from "../lib/ai";
import { isRateLimited, tooManyRequests } from "../lib/rate-limit";

const notifications = new Hono<AppContext>();
notifications.use("*", requireAuth);

notifications.get("/", async (c) => {
  const user = c.get("user");
  const [rows, unread] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
    )
      .bind(user.id)
      .all(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL")
      .bind(user.id)
      .first<{ n: number }>(),
  ]);
  return c.json({ notifications: rows.results, unread: unread?.n ?? 0 });
});

notifications.post("/:id/read", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
    .bind(nowIso(), c.req.param("id"), user.id)
    .run();
  return c.json({ ok: true });
});

/** Résumé en langage naturel des notifications non lues, pour éviter de dérouler un flux brut. */
notifications.post("/digest", async (c) => {
  const user = c.get("user");
  if (await isRateLimited(c.env, "ai-notif-digest", user.id, 15, 3600)) return tooManyRequests(c);

  const rows = await c.env.DB.prepare(
    "SELECT title, body FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 30",
  )
    .bind(user.id)
    .all<{ title: string; body: string | null }>();
  if (rows.results.length < 3) return c.json({ text: null });

  const text = await generateNotificationDigest(c.env, rows.results);
  return c.json({ text });
});

notifications.post("/read-all", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .bind(nowIso(), user.id)
    .run();
  return c.json({ ok: true });
});

export { notifications as notificationRoutes };
