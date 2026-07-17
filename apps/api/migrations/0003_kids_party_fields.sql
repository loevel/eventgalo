-- Invitations "fête d'enfants" : contact parent/tuteur distinct de l'invité,
-- et question RSVP libre définie par l'organisateur (allergies, dépôt/retrait, etc.)
ALTER TABLE guests ADD COLUMN guardian_name TEXT;
ALTER TABLE guests ADD COLUMN rsvp_note TEXT;
ALTER TABLE events ADD COLUMN rsvp_question TEXT;
