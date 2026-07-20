import Stripe from "stripe";
import type { Env } from "../types";
import { getSetting } from "./admin";

/** Client Stripe configuré pour l'environnement Workers (fetch, pas de Node http). */
export function getStripe(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() });
}

/**
 * Frais de service payés par l'acheteur, en sus du prix affiché : l'organisateur
 * reçoit 100 % de son prix, la plateforme couvre sa commission et les frais
 * Stripe avec ces frais. Réglable depuis l'espace admin (table platform_settings),
 * avec repli sur les variables d'env puis sur 5 % + 0,99 $ par billet.
 */
export async function serviceFeeCents(env: Env, amountCents: number, quantity: number): Promise<number> {
  if (amountCents <= 0) return 0;
  const percent = Number(await getSetting(env, "platform_fee_percent"));
  const fixed = Number(await getSetting(env, "platform_fee_fixed_cents"));
  return Math.round((amountCents * percent) / 100) + fixed * Math.max(1, quantity | 0);
}

export interface ConnectStatus {
  stripe_account_id: string | null;
  stripe_charges_enabled: number;
  stripe_payouts_enabled: number;
  stripe_details_submitted: number;
}

/** Compte connecté de l'organisateur, uniquement s'il peut encaisser (charges_enabled). */
export async function organizerDestination(env: Env, organizerId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT stripe_account_id, stripe_charges_enabled FROM users WHERE id = ?",
  )
    .bind(organizerId)
    .first<{ stripe_account_id: string | null; stripe_charges_enabled: number }>();
  return row?.stripe_account_id && row.stripe_charges_enabled ? row.stripe_account_id : null;
}

/** Synchronise les statuts du compte Express dans la base à partir de l'objet Stripe. */
export async function syncAccountStatus(env: Env, account: Stripe.Account): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET stripe_charges_enabled = ?, stripe_payouts_enabled = ?, stripe_details_submitted = ?
     WHERE stripe_account_id = ?`,
  )
    .bind(
      account.charges_enabled ? 1 : 0,
      account.payouts_enabled ? 1 : 0,
      account.details_submitted ? 1 : 0,
      account.id,
    )
    .run();
}
