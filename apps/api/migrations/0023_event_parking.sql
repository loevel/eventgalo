-- Disponibilité de stationnement pour un événement : champ structuré
-- (bascule + détails optionnels), affiché sur la page publique et l'invitation.
ALTER TABLE events ADD COLUMN parking_available INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN parking_details TEXT;
