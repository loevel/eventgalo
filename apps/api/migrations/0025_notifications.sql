-- Notifications in-app pour les organisateurs (miroir des emails déjà
-- envoyés sur les événements sponsoring : nouvel engagement, contre-
-- proposition, refus, candidature depuis l'annuaire).
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
