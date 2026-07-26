import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { jsonInit, seedCategory, seedEvent, seedSession, seedTicket, seedUser } from "./helpers";

async function seedPendingRefundRequest(eventId: string, categoryId: string) {
  const { id: ticketId } = await seedTicket(eventId, categoryId);
  const ticket = await env.DB.prepare("SELECT transaction_id FROM tickets WHERE id = ?")
    .bind(ticketId)
    .first<{ transaction_id: string }>();
  const requestId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO refund_requests (id, ticket_id, transaction_id, reason) VALUES (?, ?, ?, ?)",
  )
    .bind(requestId, ticketId, ticket!.transaction_id, "Empêchement")
    .run();
  return requestId;
}

describe("POST /api/events/:id/refund-requests/:rid/decision", () => {
  it("rejette la demande quand approve=false", async () => {
    const organizer = await seedUser();
    const auth = await seedSession(organizer);
    const { id: eventId } = await seedEvent(organizer.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);
    const requestId = await seedPendingRefundRequest(eventId, categoryId);

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/refund-requests/${requestId}/decision`,
      jsonInit("POST", { approve: false }, { Authorization: auth }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; status: string }>();
    expect(body.status).toBe("rejected");

    const row = await env.DB.prepare("SELECT status FROM refund_requests WHERE id = ?")
      .bind(requestId)
      .first<{ status: string }>();
    expect(row?.status).toBe("rejected");
  });

  it("refuse un corps sans champ approve valide", async () => {
    const organizer = await seedUser();
    const auth = await seedSession(organizer);
    const { id: eventId } = await seedEvent(organizer.id, { type: "ticketed" });
    const { id: categoryId } = await seedCategory(eventId);
    const requestId = await seedPendingRefundRequest(eventId, categoryId);

    const res = await SELF.fetch(
      `https://api.test/api/events/${eventId}/refund-requests/${requestId}/decision`,
      jsonInit("POST", {}, { Authorization: auth }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBeTruthy();

    // La demande reste 'pending' : rien n'a été décidé pour une requête invalide.
    const row = await env.DB.prepare("SELECT status FROM refund_requests WHERE id = ?")
      .bind(requestId)
      .first<{ status: string }>();
    expect(row?.status).toBe("pending");
  });
});
