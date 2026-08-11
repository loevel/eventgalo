import { Hono } from "hono";
import Stripe from "stripe";
import type { AppContext, Env } from "../types";
import { callEventDO } from "../do/event-do";
import { esc, eventLogoUrl, layout, sendEmail } from "../lib/email";
import { nowIso } from "../lib/crypto";
import { sendTicketsEmail } from "./public";
import { triggerWebhooks } from "../lib/webhooks";
import { syncAccountStatus } from "../lib/stripe";
import { finalizeAdPayment } from "./ads";

/** Paiement de sponsoring reçu : confirmation automatique + emails aux deux parties. */
async function finalizeSponsorPayment(env: Env, sponsorId: string, eventId: string): Promise<void> {
  const sponsor = await env.DB.prepare(
    `SELECT s.id, s.status, s.paid_at, s.company_name, s.contact_email, s.amount_cents,
            t.name AS tier_name, e.title AS event_title, u.email AS organizer_email
     FROM sponsors s
     LEFT JOIN sponsor_tiers t ON t.id = s.tier_id
     JOIN events e ON e.id = s.event_id
     JOIN users u ON u.id = e.organizer_id
     WHERE s.id = ?`,
  )
    .bind(sponsorId)
    .first<{
      id: string; status: string; paid_at: string | null; company_name: string | null; contact_email: string;
      amount_cents: number | null; tier_name: string | null; event_title: string; organizer_email: string;
    }>();
  if (!sponsor || sponsor.paid_at) return; // déjà traité (webhook rejoué)

  const now = nowIso();
  await env.DB.prepare("UPDATE sponsors SET status = 'confirmed', paid_at = ?, confirmed_at = ? WHERE id = ?")
    .bind(now, now, sponsor.id)
    .run();

  const brand = { logoUrl: await eventLogoUrl(env, eventId), eventTitle: sponsor.event_title };
  const amount = sponsor.amount_cents != null ? `${(sponsor.amount_cents / 100).toFixed(2)} $` : "";
  const company = sponsor.company_name ?? "Votre entreprise";
  await Promise.all([
    sendEmail(
      env,
      sponsor.contact_email,
      `Paiement reçu — sponsoring confirmé pour ${sponsor.event_title}`,
      layout(
        "Merci pour votre soutien !",
        `<p>Votre paiement de <strong>${esc(amount)}</strong> pour le palier
           <strong>${esc(sponsor.tier_name)}</strong> a bien été reçu.</p>
         <p><strong>${esc(company)}</strong> figure désormais parmi les sponsors de
           <strong>${esc(sponsor.event_title)}</strong> : votre logo apparaît sur la page publique de l'événement.</p>`,
        brand,
      ),
    ),
    sendEmail(
      env,
      sponsor.organizer_email,
      `Sponsoring payé en ligne — ${sponsor.event_title}`,
      layout(
        `${company} a payé son sponsoring !`,
        `<p><strong>${esc(company)}</strong> a réglé <strong>${esc(amount)}</strong> en ligne pour le palier
           <strong>${esc(sponsor.tier_name)}</strong>. Le sponsoring a été confirmé automatiquement
           et son logo apparaît sur la page publique.</p>
         <p><a href="${env.WEB_BASE_URL}/dashboard/e/${eventId}">Ouvrir le tableau de bord</a></p>`,
        brand,
      ),
    ),
    triggerWebhooks(env, eventId, "sponsor.confirmed", {
      sponsor_id: sponsor.id,
      company_name: sponsor.company_name,
      tier_name: sponsor.tier_name,
      amount_cents: sponsor.amount_cents,
    }),
  ]);
}

const webhook = new Hono<AppContext>();

webhook.post("/stripe", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "Stripe non configuré" }, 501);
  }
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Signature manquante" }, 400);

  // Deux destinations Stripe pointent ici (compte plateforme + comptes connectés),
  // chacune avec son propre secret de signature : on essaie les deux.
  const secrets = [c.env.STRIPE_WEBHOOK_SECRET, c.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => Boolean(s),
  );
  const body = await c.req.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        secret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
      break;
    } catch {
      // secret suivant
    }
  }
  if (!event) return c.json({ error: "Signature invalide" }, 400);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sponsorId = session.metadata?.sponsor_id;
    const txId = session.metadata?.transaction_id;
    const eventId = session.metadata?.event_id;
    const adSlotId = session.metadata?.ad_slot_id;
    if (sponsorId && eventId) {
      await finalizeSponsorPayment(c.env, sponsorId, eventId);
    } else if (adSlotId) {
      await finalizeAdPayment(c.env, adSlotId);
    } else if (txId && eventId) {
      const result = await callEventDO<{ tickets: Array<{ id: string; serial: string }> }>(c.env, eventId, {
        action: "finalize",
        transaction_id: txId,
        stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      });
      const tx = await c.env.DB.prepare("SELECT buyer_email, buyer_name FROM transactions WHERE id = ?")
        .bind(txId)
        .first<{ buyer_email: string; buyer_name: string }>();
      const evt = await c.env.DB.prepare("SELECT title FROM events WHERE id = ?")
        .bind(eventId)
        .first<{ title: string }>();
      if (tx && evt) {
        c.executionCtx.waitUntil(
          sendTicketsEmail(c.env, tx.buyer_email, tx.buyer_name, eventId, evt.title, result.tickets),
        );
      }
    }
  } else if (event.type === "account.updated") {
    // Statut du compte Connect Express d'un organisateur (onboarding terminé,
    // encaissements/payouts activés ou suspendus par Stripe).
    await syncAccountStatus(c.env, event.data.object as Stripe.Account);
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const txId = session.metadata?.transaction_id;
    const eventId = session.metadata?.event_id;
    if (txId && eventId) {
      await callEventDO(c.env, eventId, { action: "cancel", transaction_id: txId });
    }
  }

  return c.json({ received: true });
});

export default webhook;
