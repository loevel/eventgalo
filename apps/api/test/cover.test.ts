import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { jsonInit, seedEvent, seedMedia, seedSession, seedUser } from "./helpers";

describe("PATCH /api/events/:id/cover", () => {
  it("exige une authentification", async () => {
    const user = await seedUser();
    const { id: eventId } = await seedEvent(user.id);
    const res = await SELF.fetch(`https://api.test/api/events/${eventId}/cover`, jsonInit("PATCH", { media_id: "x" }));
    expect(res.status).toBe(401);
  });

  it("refuse une photo qui n'appartient pas à l'événement", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);
    const { id: otherEventId } = await seedEvent(user.id);
    const { id: mediaId } = await seedMedia(otherEventId);

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/cover`,
      jsonInit("PATCH", { media_id: mediaId }, { Authorization: auth }),
    );
    expect(res.status).toBe(404);
  });

  it("définit puis retire l'image de couverture", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId, slug } = await seedEvent(user.id, { status: "published" });
    const { id: mediaId } = await seedMedia(eventId);

    const setRes = await SELF.fetch(
      `https://api.test/api/events/${eventId}/cover`,
      jsonInit("PATCH", { media_id: mediaId }, { Authorization: auth }),
    );
    expect(setRes.status).toBe(200);

    const row = await env.DB.prepare("SELECT cover_media_id FROM events WHERE id = ?")
      .bind(eventId)
      .first<{ cover_media_id: string | null }>();
    expect(row?.cover_media_id).toBe(mediaId);

    const pubRes = await SELF.fetch(`https://api.test/api/public/events/${slug}`);
    const pubBody = await pubRes.json<{ event: { cover_media_id: string | null } }>();
    expect(pubBody.event.cover_media_id).toBe(mediaId);

    const clearRes = await SELF.fetch(
      `https://api.test/api/events/${eventId}/cover`,
      jsonInit("PATCH", { media_id: null }, { Authorization: auth }),
    );
    expect(clearRes.status).toBe(200);
    const cleared = await env.DB.prepare("SELECT cover_media_id FROM events WHERE id = ?")
      .bind(eventId)
      .first<{ cover_media_id: string | null }>();
    expect(cleared?.cover_media_id).toBeNull();
  });

  it("retire automatiquement la couverture quand la photo est supprimée", async () => {
    const user = await seedUser();
    const auth = await seedSession(user);
    const { id: eventId } = await seedEvent(user.id);
    const { id: mediaId } = await seedMedia(eventId);
    await SELF.fetch(
      `https://api.test/api/events/${eventId}/cover`,
      jsonInit("PATCH", { media_id: mediaId }, { Authorization: auth }),
    );

    const delRes = await SELF.fetch(
      `https://api.test/api/events/${eventId}/media/${mediaId}`,
      jsonInit("DELETE", undefined, { Authorization: auth }),
    );
    expect(delRes.status).toBe(200);

    const row = await env.DB.prepare("SELECT cover_media_id FROM events WHERE id = ?")
      .bind(eventId)
      .first<{ cover_media_id: string | null }>();
    expect(row?.cover_media_id).toBeNull();
  });
});
