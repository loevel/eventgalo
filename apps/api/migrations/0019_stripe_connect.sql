-- Stripe Connect Express : les revenus des organisateurs vont directement sur
-- leur compte connecté (destination charges) ; la plateforme garde les frais
-- de service payés par l'acheteur.
ALTER TABLE users ADD COLUMN stripe_account_id TEXT;
ALTER TABLE users ADD COLUMN stripe_charges_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN stripe_payouts_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN stripe_details_submitted INTEGER NOT NULL DEFAULT 0;

-- Frais de service payés par l'acheteur (en sus du prix affiché) et compte
-- connecté destinataire de la charge ; NULL = ancien flux (compte plateforme).
ALTER TABLE transactions ADD COLUMN service_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN stripe_destination_account TEXT;
