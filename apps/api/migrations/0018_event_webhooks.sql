-- Webhooks sortants génériques : un organisateur peut brancher Zapier/Make/son
-- propre outil sur les événements clés de son événement (billet vendu, sponsoring
-- confirmé/refusé, demande de remboursement), sans qu'on ait à coder une
-- intégration nommée par outil tiers.
CREATE TABLE event_webhooks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,          -- signe chaque livraison (HMAC-SHA256), généré côté serveur
  event_types TEXT,              -- JSON array des types souscrits ; NULL = tous
  enabled INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  last_status INTEGER,           -- code HTTP de la dernière tentative de livraison
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_event_webhooks_event ON event_webhooks(event_id);
