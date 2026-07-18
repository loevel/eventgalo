-- Demandes de sponsoring initiées par les organisateurs depuis l'annuaire (phase 2).
ALTER TABLE sponsors ADD COLUMN invite_message TEXT;  -- mot de l'organisateur à l'entreprise
ALTER TABLE sponsors ADD COLUMN source TEXT NOT NULL DEFAULT 'invite'
  CHECK (source IN ('invite','directory'));
