import type { Env } from "../types";
import { nowIso, randomSerial, uuid } from "../lib/crypto";

/**
 * Un Durable Object par événement : toutes les opérations qui touchent aux
 * compteurs (réservation, finalisation, annulation, scan, remboursement)
 * passent par ici. Le DO étant mono-thread, deux checkouts simultanés sur
 * les dernières places ne peuvent pas se croiser (règle 5.4.4), et la
 * transition valide → utilisé d'un billet est atomique (règle 5.4.5).
 */

interface ReserveInput {
  action: "reserve";
  event_id: string;
  category_id: string;
  seller_code?: string;
  quantity: number;
  buyer_name: string;
  buyer_email: string;
  consent: boolean;
}

interface FinalizeInput {
  action: "finalize";
  transaction_id: string;
  stripe_payment_intent?: string;
}

interface CancelInput {
  action: "cancel";
  transaction_id: string;
}

interface ScanInput {
  action: "scan";
  ticket_id: string;
  event_id: string;
}

interface RefundInput {
  action: "refund_ticket";
  ticket_id: string;
}

type DoInput = ReserveInput | FinalizeInput | CancelInput | ScanInput | RefundInput;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export class EventDO implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    let input: DoInput;
    try {
      input = (await req.json()) as DoInput;
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }
    try {
      switch (input.action) {
        case "reserve":
          return json(await this.reserve(input));
        case "finalize":
          return json(await this.finalize(input));
        case "cancel":
          return json(await this.cancel(input));
        case "scan":
          return json(await this.scan(input));
        case "refund_ticket":
          return json(await this.refundTicket(input));
        default:
          return json({ error: "action inconnue" }, 400);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "erreur interne";
      return json({ error: message }, 409);
    }
  }

  private async reserve(input: ReserveInput) {
    const db = this.env.DB;
    const cat = await db
      .prepare("SELECT * FROM ticket_categories WHERE id = ? AND event_id = ?")
      .bind(input.category_id, input.event_id)
      .first<{ id: string; price_cents: number; currency: string; quantity: number; sold: number }>();
    if (!cat) throw new Error("Catégorie de billets introuvable");
    if (input.quantity < 1 || input.quantity > 10) throw new Error("Quantité invalide (1 à 10)");
    if (cat.sold + input.quantity > cat.quantity) {
      throw new Error(`Plus assez de places dans cette catégorie (${cat.quantity - cat.sold} restante(s))`);
    }

    let sellerId: string | null = null;
    if (input.seller_code) {
      const seller = await db
        .prepare(
          `SELECT s.id AS seller_id, q.quota, q.sold AS q_sold
           FROM sellers s
           LEFT JOIN seller_quotas q ON q.seller_id = s.id AND q.category_id = ?
           WHERE s.code = ? AND s.event_id = ?`,
        )
        .bind(input.category_id, input.seller_code, input.event_id)
        .first<{ seller_id: string; quota: number | null; q_sold: number | null }>();
      if (!seller) throw new Error("Code vendeur invalide");
      if (seller.quota === null) throw new Error("Ce vendeur n'a pas de quota sur cette catégorie");
      if ((seller.q_sold ?? 0) + input.quantity > seller.quota) {
        throw new Error(`Quota vendeur dépassé (${seller.quota - (seller.q_sold ?? 0)} restant(s))`);
      }
      sellerId = seller.seller_id;
    }

    const txId = uuid();
    const amount = cat.price_cents * input.quantity;
    const statements = [
      db
        .prepare("UPDATE ticket_categories SET sold = sold + ? WHERE id = ?")
        .bind(input.quantity, input.category_id),
      db
        .prepare(
          `INSERT INTO transactions (id, event_id, category_id, seller_id, buyer_name, buyer_email,
             quantity, amount_cents, currency, status, consent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .bind(
          txId,
          input.event_id,
          input.category_id,
          sellerId,
          input.buyer_name,
          input.buyer_email,
          input.quantity,
          amount,
          cat.currency,
          input.consent ? nowIso() : null,
        ),
    ];
    if (sellerId) {
      statements.push(
        db
          .prepare("UPDATE seller_quotas SET sold = sold + ? WHERE seller_id = ? AND category_id = ?")
          .bind(input.quantity, sellerId, input.category_id),
      );
    }
    await db.batch(statements);
    return { transaction_id: txId, amount_cents: amount, currency: cat.currency };
  }

  private async finalize(input: FinalizeInput) {
    const db = this.env.DB;
    const tx = await db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .bind(input.transaction_id)
      .first<{
        id: string;
        event_id: string;
        category_id: string;
        seller_id: string | null;
        buyer_name: string;
        buyer_email: string;
        quantity: number;
        status: string;
      }>();
    if (!tx) throw new Error("Transaction introuvable");
    if (tx.status === "paid") {
      // Idempotence (retries de webhook Stripe)
      const existing = await db
        .prepare("SELECT * FROM tickets WHERE transaction_id = ?")
        .bind(tx.id)
        .all();
      return { tickets: existing.results };
    }
    if (tx.status !== "pending") throw new Error(`Transaction au statut ${tx.status}`);

    const statements = [];
    const tickets = [];
    for (let i = 0; i < tx.quantity; i++) {
      const id = uuid();
      const serial = randomSerial(10);
      tickets.push({ id, serial });
      statements.push(
        db
          .prepare(
            `INSERT INTO tickets (id, event_id, category_id, transaction_id, seller_id,
               buyer_name, buyer_email, serial, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'valid')`,
          )
          .bind(id, tx.event_id, tx.category_id, tx.id, tx.seller_id, tx.buyer_name, tx.buyer_email, serial),
      );
    }
    statements.push(
      db
        .prepare("UPDATE transactions SET status = 'paid', stripe_payment_intent = COALESCE(?, stripe_payment_intent) WHERE id = ?")
        .bind(input.stripe_payment_intent ?? null, tx.id),
    );
    await db.batch(statements);
    return { tickets };
  }

  private async cancel(input: CancelInput) {
    const db = this.env.DB;
    const tx = await db
      .prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'")
      .bind(input.transaction_id)
      .first<{ id: string; category_id: string; seller_id: string | null; quantity: number }>();
    if (!tx) return { canceled: false };
    const statements = [
      db.prepare("UPDATE ticket_categories SET sold = sold - ? WHERE id = ?").bind(tx.quantity, tx.category_id),
      db.prepare("UPDATE transactions SET status = 'canceled' WHERE id = ?").bind(tx.id),
    ];
    if (tx.seller_id) {
      statements.push(
        db
          .prepare("UPDATE seller_quotas SET sold = sold - ? WHERE seller_id = ? AND category_id = ?")
          .bind(tx.quantity, tx.seller_id, tx.category_id),
      );
    }
    await db.batch(statements);
    return { canceled: true };
  }

  private async scan(input: ScanInput) {
    const db = this.env.DB;
    const ticket = await db
      .prepare(
        `SELECT t.id, t.serial, t.buyer_name, t.status, t.used_at, c.name AS category_name
         FROM tickets t JOIN ticket_categories c ON c.id = t.category_id
         WHERE t.id = ? AND t.event_id = ?`,
      )
      .bind(input.ticket_id, input.event_id)
      .first<{ id: string; serial: string; buyer_name: string; status: string; used_at: string | null; category_name: string }>();

    if (!ticket) {
      return { ok: false, status: "not_found", message: "Billet introuvable pour cet événement" };
    }
    const base = {
      serial: ticket.serial,
      buyer_name: ticket.buyer_name,
      category_name: ticket.category_name,
      used_at: ticket.used_at,
    };
    if (ticket.status === "valid") {
      const res = await db
        .prepare("UPDATE tickets SET status = 'used', used_at = ? WHERE id = ? AND status = 'valid'")
        .bind(nowIso(), ticket.id)
        .run();
      if (res.meta.changes === 1) {
        return { ok: true, status: "valid", ticket: { ...base, status: "used" }, message: "Billet valide — entrée autorisée" };
      }
      return { ok: false, status: "already_used", ticket: base, message: "Billet DÉJÀ utilisé (scan simultané)" };
    }
    if (ticket.status === "used") {
      return { ok: false, status: "already_used", ticket: base, message: `Billet DÉJÀ utilisé le ${ticket.used_at}` };
    }
    return { ok: false, status: ticket.status, ticket: base, message: `Billet ${ticket.status === "refunded" ? "remboursé" : "annulé"}` };
  }

  private async refundTicket(input: RefundInput) {
    const db = this.env.DB;
    const t = await db
      .prepare("SELECT * FROM tickets WHERE id = ? AND status IN ('valid','used')")
      .bind(input.ticket_id)
      .first<{ id: string; category_id: string; seller_id: string | null; transaction_id: string }>();
    if (!t) throw new Error("Billet non remboursable (déjà remboursé ou annulé)");
    const statements = [
      db.prepare("UPDATE tickets SET status = 'refunded' WHERE id = ?").bind(t.id),
      db.prepare("UPDATE ticket_categories SET sold = sold - 1 WHERE id = ?").bind(t.category_id),
      // Dernier billet vivant de la transaction → la transaction entière est remboursée
      db
        .prepare(
          `UPDATE transactions SET status = 'refunded'
           WHERE id = ? AND NOT EXISTS (
             SELECT 1 FROM tickets WHERE transaction_id = ? AND id != ? AND status IN ('valid','used'))`,
        )
        .bind(t.transaction_id, t.transaction_id, t.id),
    ];
    if (t.seller_id) {
      statements.push(
        db
          .prepare("UPDATE seller_quotas SET sold = sold - 1 WHERE seller_id = ? AND category_id = ?")
          .bind(t.seller_id, t.category_id),
      );
    }
    await db.batch(statements);
    return { refunded: true, transaction_id: t.transaction_id };
  }
}

/** Appel RPC vers le DO de l'événement. */
export async function callEventDO<T = Record<string, unknown>>(
  env: Env,
  eventId: string,
  body: DoInput,
): Promise<T> {
  const stub = env.EVENT_DO.get(env.EVENT_DO.idFromName(eventId));
  const res = await stub.fetch("https://do/rpc", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new DOError(data.error ?? "Erreur interne");
  return data;
}

export class DOError extends Error {}
