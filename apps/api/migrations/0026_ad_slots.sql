-- Bandeau publicitaire de la page d'accueil : créneaux payés par des entreprises
-- de l'annuaire, ciblés par secteur (déclaratif) et région (géolocalisation Cloudflare).

CREATE TABLE ad_slots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  link_url TEXT NOT NULL,
  image_key TEXT,
  image_type TEXT,
  sector TEXT,                          -- NULL = tous secteurs ; sinon valeur de COMPANY_SECTORS
  region TEXT,                          -- NULL = tout le Canada ; sinon valeur de request.cf.region
  weeks INTEGER NOT NULL,
  starts_at TEXT,                       -- fixé au paiement (webhook), pas à la création
  ends_at TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','active','expired','rejected')),
  stripe_session_id TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_ad_slots_company ON ad_slots(company_id);
CREATE INDEX idx_ad_slots_active ON ad_slots(status, starts_at, ends_at);
