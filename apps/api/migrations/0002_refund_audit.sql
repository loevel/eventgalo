-- Audit des remboursements Stripe
ALTER TABLE refund_requests ADD COLUMN stripe_refund_id TEXT;
ALTER TABLE refund_requests ADD COLUMN refund_amount_cents INTEGER;
