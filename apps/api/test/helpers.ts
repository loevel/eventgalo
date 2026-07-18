import { env } from "cloudflare:test";
import { createSession } from "../src/lib/auth";
import type { AuthedUser } from "../src/types";

export async function seedUser(overrides: Partial<AuthedUser> = {}): Promise<AuthedUser> {
  const id = crypto.randomUUID();
  const user: AuthedUser = {
    id,
    email: overrides.email ?? `${id}@example.com`,
    name: overrides.name ?? "Organisateur Test",
  };
  await env.DB.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)")
    .bind(user.id, user.email, user.name)
    .run();
  return user;
}

/** Crée une session valide et renvoie le header Authorization prêt à l'emploi. */
export async function seedSession(user: AuthedUser): Promise<string> {
  const token = crypto.randomUUID();
  await createSession(env.KV, user, token);
  return `Bearer ${token}`;
}

export async function seedEvent(
  organizerId: string,
  overrides: Partial<{
    title: string;
    type: "private" | "ticketed";
    status: "draft" | "published" | "archived";
    capacity: number;
    rsvpQuestion: string | null;
  }> = {},
): Promise<{ id: string; slug: string }> {
  const id = crypto.randomUUID();
  const slug = `test-event-${id.slice(0, 8)}`;
  await env.DB.prepare(
    `INSERT INTO events (id, organizer_id, title, starts_at, capacity, public_slug, scanner_key, type, status, rsvp_question)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      organizerId,
      overrides.title ?? "Événement de test",
      "2027-01-01T20:00:00.000Z",
      overrides.capacity ?? 50,
      slug,
      "scanner-key",
      overrides.type ?? "private",
      overrides.status ?? "published",
      overrides.rsvpQuestion ?? null,
    )
    .run();
  return { id, slug };
}

export async function seedGuest(
  eventId: string,
  overrides: Partial<{ name: string; email: string | null; guardianName: string | null }> = {},
): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  const token = `test-token-${id}`;
  await env.DB.prepare(
    "INSERT INTO guests (id, event_id, name, email, token, guardian_name) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, eventId, overrides.name ?? "Invité Test", overrides.email ?? null, token, overrides.guardianName ?? null)
    .run();
  return { id, token };
}

export async function seedCategory(
  eventId: string,
  overrides: Partial<{ name: string; quantity: number; sold: number; priceCents: number }> = {},
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO ticket_categories (id, event_id, name, price_cents, quantity, sold) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id, eventId, overrides.name ?? "Général",
      overrides.priceCents ?? 0, overrides.quantity ?? 10, overrides.sold ?? 0,
    )
    .run();
  return { id };
}

export async function seedTicket(
  eventId: string,
  categoryId: string,
  overrides: Partial<{ buyerName: string; buyerEmail: string; status: "valid" | "used" | "refunded" | "void"; serial: string }> = {},
): Promise<{ id: string; serial: string }> {
  const txId = crypto.randomUUID();
  const buyerName = overrides.buyerName ?? "Acheteur Test";
  const buyerEmail = overrides.buyerEmail ?? "acheteur@example.com";
  await env.DB.prepare(
    `INSERT INTO transactions (id, event_id, category_id, buyer_name, buyer_email, quantity, amount_cents, status)
     VALUES (?, ?, ?, ?, ?, 1, 0, 'paid')`,
  )
    .bind(txId, eventId, categoryId, buyerName, buyerEmail)
    .run();
  const id = crypto.randomUUID();
  const serial = overrides.serial ?? `TEST${id.slice(0, 8).toUpperCase()}`;
  await env.DB.prepare(
    `INSERT INTO tickets (id, event_id, category_id, transaction_id, buyer_name, buyer_email, serial, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, eventId, categoryId, txId, buyerName, buyerEmail, serial, overrides.status ?? "valid")
    .run();
  return { id, serial };
}

export async function seedMedia(
  eventId: string,
  overrides: Partial<{ guestId: string | null; r2Key: string; contentType: string }> = {},
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO media (id, event_id, guest_id, r2_key, content_type) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, eventId, overrides.guestId ?? null, overrides.r2Key ?? `events/${eventId}/${id}`, overrides.contentType ?? "image/jpeg")
    .run();
  return { id };
}

export function jsonInit(method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}
