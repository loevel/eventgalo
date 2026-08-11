import type { Env } from "../types";
import { nowIso, randomSerial, uuid } from "../lib/crypto";

/**
 * Un Durable Object par événement : toutes les opérations qui touchent aux
 * compteurs (réservation, finalisation, annulation, scan, remboursement)
 * passent par ici.
 *
 * ATTENTION — le DO ne stocke rien localement : tout son état vit dans D1,
 * atteint par le réseau. L'« input gating » qui sérialise les requêtes d'un DO
 * ne couvre que les `await` sur le stockage du DO lui-même ; sur un
 * `await db.prepare(...)` une seconde requête entre et s'entrelace. La
 * sérialisation repose donc sur deux couches, et il faut les deux :
 *
 *  1. `blockConcurrencyWhile` autour de chaque opération mutante — deux appels
 *     concurrents sur la même instance ne peuvent plus s'entrelacer.
 *  2. Des écritures conditionnelles (`WHERE ... AND status = ?`) dont on vérifie
 *     `meta.changes` — seul garde-fou qui survit à une migration ou un
 *     redémarrage du DO, où deux instances peuvent coexister brièvement.
 *
 * Les contraintes `CHECK (sold >= 0 AND sold <= quantity)` de la base forment
 * la troisième et dernière ligne de défense (voir `mapDbError`).
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

/**
 * Erreur métier : message rédigé pour l'utilisateur final, renvoyé tel quel en 409.
 * Tout ce qui n'en est pas une est un incident technique (contrainte violée,
 * D1 indisponible…) : message générique en 500 et remontée à Sentry côté worker.
 */
export class BusinessError extends Error {}

/** Résultat d'une opération du DO, transporté comme valeur plutôt que comme exception. */
type Outcome = { ok: true; data: unknown } | { ok: false; error: Error };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Traduit une violation de contrainte de stock en message métier. La contrainte
 * `CHECK` est le dernier filet quand deux instances du DO coexistent : le batch
 * D1 est rejeté en bloc, mais l'acheteur ne doit pas lire un message SQLite.
 */
function mapDbError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (/CHECK constraint failed/i.test(message)) {
    if (/quota/i.test(message)) return new BusinessError("Quota vendeur dépassé pour cette catégorie");
    return new BusinessError("Plus assez de places dans cette catégorie");
  }
  return e instanceof Error ? e : new Error(message);
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
    // Sérialise les opérations concurrentes sur le même événement : sans ça,
    // chaque `await` vers D1 est un point d'entrelacement (voir en-tête).
    //
    // L'erreur est capturée *à l'intérieur* et renvoyée comme valeur : une
    // exception qui traverse `blockConcurrencyWhile` fait détruire et redémarrer
    // le Durable Object, ce qui interromprait aussi les requêtes concurrentes.
    // Or un refus métier — « plus assez de places » — est un cas nominal ici.
    const outcome = await this.state.blockConcurrencyWhile(async (): Promise<Outcome> => {
      try {
        switch (input.action) {
          case "reserve":
            return { ok: true, data: await this.reserve(input) };
          case "finalize":
            return { ok: true, data: await this.finalize(input) };
          case "cancel":
            return { ok: true, data: await this.cancel(input) };
          case "scan":
            return { ok: true, data: await this.scan(input) };
          case "refund_ticket":
            return { ok: true, data: await this.refundTicket(input) };
          default:
            return { ok: false, error: new BusinessError("action inconnue") };
        }
      } catch (e) {
        return { ok: false, error: mapDbError(e) };
      }
    });

    if (outcome.ok) return json(outcome.data);
    if (outcome.error instanceof BusinessError) return json({ error: outcome.error.message }, 409);
    // Incident technique : pas de détail interne vers le client, mais une trace
    // exploitable côté worker (le 500 est relayé en exception, donc en Sentry).
    console.error("[EventDO]", input.action, outcome.error);
    return json({ error: "Erreur interne du serveur" }, 500);
  }

  private async reserve(input: ReserveInput) {
    const db = this.env.DB;
    const cat = await db
      .prepare("SELECT * FROM ticket_categories WHERE id = ? AND event_id = ?")
      .bind(input.category_id, input.event_id)
      .first<{ id: string; price_cents: number; currency: string; quantity: number; sold: number }>();
    if (!cat) throw new BusinessError("Catégorie de billets introuvable");
    if (input.quantity < 1 || input.quantity > 10) throw new BusinessError("Quantité invalide (1 à 10)");
    if (cat.sold + input.quantity > cat.quantity) {
      throw new BusinessError(`Plus assez de places dans cette catégorie (${cat.quantity - cat.sold} restante(s))`);
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
      if (!seller) throw new BusinessError("Code vendeur invalide");
      if (seller.quota === null) throw new BusinessError("Ce vendeur n'a pas de quota sur cette catégorie");
      if ((seller.q_sold ?? 0) + input.quantity > seller.quota) {
        throw new BusinessError(`Quota vendeur dépassé (${seller.quota - (seller.q_sold ?? 0)} restant(s))`);
      }
      sellerId = seller.seller_id;
    }

    const txId = uuid();
    const amount = cat.price_cents * input.quantity;
    // `WHERE sold + ? <= quantity` : si une autre instance du DO a réservé entre
    // la lecture ci-dessus et ici, l'UPDATE ne touche aucune ligne et la
    // contrainte CHECK n'a même pas à intervenir.
    const statements = [
      db
        .prepare("UPDATE ticket_categories SET sold = sold + ? WHERE id = ? AND sold + ? <= quantity")
        .bind(input.quantity, input.category_id, input.quantity),
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
          .prepare(
            "UPDATE seller_quotas SET sold = sold + ? WHERE seller_id = ? AND category_id = ? AND sold + ? <= quota",
          )
          .bind(input.quantity, sellerId, input.category_id, input.quantity),
      );
    }
    const results = await db.batch(statements);
    // Un UPDATE conditionnel qui ne touche aucune ligne n'est pas une erreur SQL :
    // le batch est passé quand même. On inspecte donc `changes` et on compense à
    // la main ce qui a été appliqué avant d'annuler la transaction.
    const stockTaken = results[0].meta.changes === 1;
    const quotaTaken = !sellerId || results[2].meta.changes === 1;
    if (!stockTaken || !quotaTaken) {
      const undo = [db.prepare("UPDATE transactions SET status = 'canceled' WHERE id = ?").bind(txId)];
      if (stockTaken) {
        undo.push(
          db
            .prepare("UPDATE ticket_categories SET sold = sold - ? WHERE id = ?")
            .bind(input.quantity, input.category_id),
        );
      }
      if (sellerId && quotaTaken) {
        undo.push(
          db
            .prepare("UPDATE seller_quotas SET sold = sold - ? WHERE seller_id = ? AND category_id = ?")
            .bind(input.quantity, sellerId, input.category_id),
        );
      }
      await db.batch(undo);
      throw new BusinessError(
        stockTaken ? "Quota vendeur dépassé pour cette catégorie" : "Plus assez de places dans cette catégorie",
      );
    }
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
    if (!tx) throw new BusinessError("Transaction introuvable");
    if (tx.status !== "pending" && tx.status !== "paid") {
      throw new BusinessError(`Transaction au statut ${tx.status}`);
    }

    // Revendication atomique du droit d'émettre les billets : seul l'appel dont
    // l'UPDATE touche une ligne poursuit. Stripe rejoue ses webhooks, et sans ce
    // garde-fou deux livraisons concurrentes émettaient chacune un jeu complet
    // de billets pour un seul paiement.
    const claim = await db
      .prepare(
        `UPDATE transactions SET status = 'paid',
           stripe_payment_intent = COALESCE(?, stripe_payment_intent)
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(input.stripe_payment_intent ?? null, tx.id)
      .run();

    if (claim.meta.changes !== 1) {
      // Un autre appel a déjà finalisé : on lui rend ses billets (idempotence).
      const existing = await db
        .prepare("SELECT * FROM tickets WHERE transaction_id = ? ORDER BY created_at")
        .bind(tx.id)
        .all();
      return { tickets: existing.results };
    }

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
    try {
      await db.batch(statements);
    } catch (e) {
      // La transaction est marquée payée mais sans billets : on la relâche pour
      // que le prochain appel (retry Stripe) puisse réessayer proprement.
      await db.prepare("UPDATE transactions SET status = 'pending' WHERE id = ?").bind(tx.id).run();
      throw e;
    }
    return { tickets };
  }

  private async cancel(input: CancelInput) {
    const db = this.env.DB;
    const tx = await db
      .prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'")
      .bind(input.transaction_id)
      .first<{ id: string; category_id: string; seller_id: string | null; quantity: number }>();
    if (!tx) return { canceled: false };

    // Revendication : sans elle, une double annulation (webhook `expired` +
    // balayage des paniers morts) décrémentait `sold` deux fois.
    const claim = await db
      .prepare("UPDATE transactions SET status = 'canceled' WHERE id = ? AND status = 'pending'")
      .bind(tx.id)
      .run();
    if (claim.meta.changes !== 1) return { canceled: false };

    const statements = [
      db.prepare("UPDATE ticket_categories SET sold = sold - ? WHERE id = ?").bind(tx.quantity, tx.category_id),
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
    if (!t) throw new BusinessError("Billet non remboursable (déjà remboursé ou annulé)");

    // Revendication : deux approbations concurrentes de la même demande
    // décrémentaient `sold` deux fois.
    const claim = await db
      .prepare("UPDATE tickets SET status = 'refunded' WHERE id = ? AND status IN ('valid','used')")
      .bind(t.id)
      .run();
    if (claim.meta.changes !== 1) {
      throw new BusinessError("Billet non remboursable (déjà remboursé ou annulé)");
    }

    const statements = [
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
  if (res.ok) return data;
  // 409 = refus métier, message destiné à l'utilisateur. Tout le reste est un
  // incident : on lève une erreur ordinaire, qui remonte au handler global et
  // donc à Sentry, au lieu d'être maquillée en refus métier.
  if (res.status === 409) throw new DOError(data.error ?? "Opération refusée");
  throw new Error(`EventDO ${body.action} a échoué (${res.status}): ${data.error ?? "erreur inconnue"}`);
}

export class DOError extends Error {}
