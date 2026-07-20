import { Hono } from "hono";
import type { Context } from "hono";
import type { AppContext } from "../types";
import { requireAuth } from "../lib/auth";
import { getStripe, syncAccountStatus, type ConnectStatus } from "../lib/stripe";

/**
 * Onboarding Stripe Connect Express des organisateurs : leurs revenus de
 * billetterie et de sponsoring sont versés directement sur leur compte,
 * avec payouts hebdomadaires automatiques.
 */
const connect = new Hono<AppContext>();
connect.use("*", requireAuth);

async function getConnectRow(c: Context<AppContext>): Promise<ConnectStatus | null> {
  return c.env.DB.prepare(
    `SELECT stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted
     FROM users WHERE id = ?`,
  )
    .bind(c.get("user").id)
    .first<ConnectStatus>();
}

/** Statut du compte : rafraîchi depuis Stripe si l'onboarding n'est pas terminé. */
connect.get("/status", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) return c.json({ configured: false });
  const row = await getConnectRow(c);
  if (!row?.stripe_account_id) {
    return c.json({ configured: true, onboarded: false, charges_enabled: false, payouts_enabled: false });
  }
  // Tant que tout n'est pas activé, on resynchronise depuis Stripe (retour d'onboarding).
  let { stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted } = row;
  if (!stripe_charges_enabled || !stripe_payouts_enabled) {
    const account = await getStripe(c.env).accounts.retrieve(row.stripe_account_id);
    await syncAccountStatus(c.env, account);
    stripe_charges_enabled = account.charges_enabled ? 1 : 0;
    stripe_payouts_enabled = account.payouts_enabled ? 1 : 0;
    stripe_details_submitted = account.details_submitted ? 1 : 0;
  }
  return c.json({
    configured: true,
    onboarded: Boolean(stripe_details_submitted),
    charges_enabled: Boolean(stripe_charges_enabled),
    payouts_enabled: Boolean(stripe_payouts_enabled),
  });
});

/** Crée (ou reprend) le compte Express et renvoie le lien d'onboarding hébergé. */
connect.post("/onboarding", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "Stripe non configuré" }, 501);
  const stripe = getStripe(c.env);
  const user = c.get("user");
  const row = await getConnectRow(c);

  let accountId = row?.stripe_account_id ?? null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "CA",
      email: user.email,
      default_currency: "cad",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { product_description: "Vente de billets d'événements via EventGalo" },
      settings: {
        payouts: { schedule: { interval: "weekly", weekly_anchor: "friday" } },
      },
      metadata: { eventgalo_user_id: user.id },
    });
    accountId = account.id;
    await c.env.DB.prepare("UPDATE users SET stripe_account_id = ? WHERE id = ?")
      .bind(accountId, user.id)
      .run();
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: `${c.env.WEB_BASE_URL}/dashboard?connect=return`,
    refresh_url: `${c.env.WEB_BASE_URL}/dashboard?connect=refresh`,
  });
  return c.json({ onboarding_url: link.url });
});

export default connect;
