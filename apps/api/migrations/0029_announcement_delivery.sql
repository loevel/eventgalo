-- Suivi de la diffusion des annonces (« notes » ajoutées après publication :
-- porte d'entrée au 1er étage, changement d'horaire…). Jusqu'ici l'email
-- partait uniquement aux invités RSVP et rien n'était tracé : l'organisateur
-- ne pouvait pas savoir si la note avait été diffusée, et les détenteurs de
-- billets n'étaient jamais prévenus.
ALTER TABLE announcements ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;
ALTER TABLE announcements ADD COLUMN recipients_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE announcements ADD COLUMN notified_at TEXT;
