-- Journal des questions posées à l'assistant IA d'un événement.
--
-- L'assistant répond « je ne sais pas, contactez l'organisateur » quand
-- l'information manque — et cette information se perdait. Or c'est le signal le
-- plus utile de toute la fiche : chaque question sans réponse est un champ que
-- l'organisateur n'a pas rempli et que de vrais visiteurs sont venus chercher.
--
-- `answered = 0` marque précisément ces trous. Le tableau de bord les remonte
-- pour que l'organisateur complète sa fiche là où ça compte, plutôt qu'au hasard.
CREATE TABLE event_questions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  answered INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_event_questions_event ON event_questions(event_id, created_at);
