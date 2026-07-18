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

export function jsonInit(method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}
