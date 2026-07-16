import { Hono } from "hono";
import Stripe from "stripe";
import type { AppContext } from "../types";
import { callEventDO } from "../do/event-do";
import { sendTicketsEmail } from "./public";

const webhook = new Hono<AppContext>();

webhook.post("/stripe", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "Stripe non configuré" }, 501);
  }
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Signature manquante" }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await c.req.text(),
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return c.json({ error: "Signature invalide" }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const txId = session.metadata?.transaction_id;
    const eventId = session.metadata?.event_id;
    if (txId && eventId) {
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
          sendTicketsEmail(c.env, tx.buyer_email, tx.buyer_name, evt.title, result.tickets),
        );
      }
    }
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
