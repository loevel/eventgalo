-- Paiement en ligne du sponsoring via Stripe Checkout.
ALTER TABLE sponsors ADD COLUMN stripe_session_id TEXT;
ALTER TABLE sponsors ADD COLUMN paid_at TEXT;
