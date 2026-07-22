import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { seedSession, seedUser } from "./helpers";

describe("GET/POST /api/notifications", () => {
  it("exige une authentification", async () => {
    const res = await SELF.fetch("https://api.test/api/notifications");
    expect(res.status).toBe(401);
  });

  it("liste les notifications de l'utilisateur, marque comme lu, et tout marquer comme lu", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);

    await env.DB.prepare(
      "INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), user.id, "sponsor_engagement", "Notif 1", "Corps 1", "/dashboard/e/x")
      .run();
    await env.DB.prepare(
      "INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), user.id, "sponsor_declined", "Notif 2", null, null)
      .run();

    const listRes = await SELF.fetch("https://api.test/api/notifications", { headers: { Authorization: auth } });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json<{ notifications: Array<{ id: string; title: string }>; unread: number }>();
    expect(listBody.notifications).toHaveLength(2);
    expect(listBody.unread).toBe(2);

    const firstId = listBody.notifications[0].id;
    const readRes = await SELF.fetch(`https://api.test/api/notifications/${firstId}/read`, {
      method: "POST",
      headers: { Authorization: auth },
    });
    expect(readRes.status).toBe(200);

    const afterRead = await SELF.fetch("https://api.test/api/notifications", { headers: { Authorization: auth } });
    expect((await afterRead.json<{ unread: number }>()).unread).toBe(1);

    const readAllRes = await SELF.fetch("https://api.test/api/notifications/read-all", {
      method: "POST",
      headers: { Authorization: auth },
    });
    expect(readAllRes.status).toBe(200);

    const afterReadAll = await SELF.fetch("https://api.test/api/notifications", { headers: { Authorization: auth } });
    expect((await afterReadAll.json<{ unread: number }>()).unread).toBe(0);
  });

  it("n'affiche pas les notifications d'un autre utilisateur", async () => {
    const userA = await seedUser();
    const userB = await seedUser();
    const authB = await seedSession(userB);

    await env.DB.prepare(
      "INSERT INTO notifications (id, user_id, type, title) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), userA.id, "sponsor_engagement", "Pas pour toi")
      .run();

    const res = await SELF.fetch("https://api.test/api/notifications", { headers: { Authorization: authB } });
    const body = await res.json<{ notifications: unknown[] }>();
    expect(body.notifications).toHaveLength(0);
  });
});
