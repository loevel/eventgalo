-- EventGalo — schéma initial (MVP)
-- Toutes les dates en ISO 8601 UTC (TEXT).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  venue TEXT,
  address TEXT,
  dress_code TEXT,
  seating_plan TEXT,             -- JSON libre : [{table, invités…}] ou texte
  capacity INTEGER NOT NULL DEFAULT 0,
  public_slug TEXT NOT NULL UNIQUE,
  scanner_key TEXT NOT NULL,     -- clé donnée aux contrôleurs pour la PWA scan
  type TEXT NOT NULL DEFAULT 'private' CHECK (type IN ('private','ticketed')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  refund_policy TEXT,            -- JSON {kind, days_before, percent}
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_events_organizer ON events(organizer_id);

CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  token TEXT NOT NULL UNIQUE,    -- lien personnalisé, généré via Web Crypto
  table_name TEXT,
  plus_ones INTEGER NOT NULL DEFAULT 0,
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending','yes','no')),
  rsvp_at TEXT,
  opened_at TEXT,                -- première ouverture du lien
  consent_at TEXT,               -- consentement Loi 25 / RGPD
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_guests_event ON guests(event_id);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_announcements_event ON announcements(event_id);

CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  quantity INTEGER NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,  -- inclut les réservations en cours de checkout
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (sold >= 0 AND sold <= quantity)
);
CREATE INDEX idx_categories_event ON ticket_categories(event_id);

CREATE TABLE sellers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  code TEXT NOT NULL UNIQUE,     -- lien/code de vente unique
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sellers_event ON sellers(event_id);

CREATE TABLE seller_quotas (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id) ON DELETE CASCADE,
  quota INTEGER NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,
  UNIQUE (seller_id, category_id),
  CHECK (sold >= 0 AND sold <= quota)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  seller_id TEXT REFERENCES sellers(id),
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','canceled')),
  consent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_transactions_event ON transactions(event_id);
CREATE INDEX idx_transactions_stripe ON transactions(stripe_session_id);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  seller_id TEXT REFERENCES sellers(id),
  buyer_name TEXT NOT NULL,      -- billet nominatif
  buyer_email TEXT NOT NULL,
  serial TEXT NOT NULL UNIQUE,   -- identifiant court lisible (base32)
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','refunded','void')),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_tickets_event ON tickets(event_id);
CREATE INDEX idx_tickets_transaction ON tickets(transaction_id);

CREATE TABLE refund_requests (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_refunds_ticket ON refund_requests(ticket_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id TEXT REFERENCES guests(id),
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_media_event ON media(event_id);
