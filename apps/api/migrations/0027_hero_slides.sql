-- Diapositives du carrousel plein écran du hero de la page d'accueil, gérées
-- depuis l'espace admin (image optionnelle + légende, réordonnables).

CREATE TABLE hero_slides (
  id TEXT PRIMARY KEY,
  image_key TEXT,
  image_type TEXT,
  caption TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_hero_slides_active ON hero_slides(active, position);
