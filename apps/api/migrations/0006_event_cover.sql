-- Image de couverture d'événement : référence une photo déjà uploadée dans media.
ALTER TABLE events ADD COLUMN cover_media_id TEXT REFERENCES media(id);
