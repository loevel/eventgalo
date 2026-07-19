-- Artistes et intervenants d'un événement (musicien, animateur/MC, imprésario,
-- conférencier…) : rôle en texte libre pour rester générique, jusqu'à 2 photos
-- optionnelles par personne, ordre d'affichage via rank.
CREATE TABLE event_performers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  bio TEXT,
  photo1_media_id TEXT REFERENCES media(id),
  photo2_media_id TEXT REFERENCES media(id),
  rank INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_event_performers_event ON event_performers(event_id);
