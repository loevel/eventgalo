-- Consigne un échec de remboursement Stripe survenu après que le billet a déjà été marqué remboursé
ALTER TABLE refund_requests ADD COLUMN stripe_error TEXT;
