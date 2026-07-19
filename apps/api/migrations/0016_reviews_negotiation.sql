-- Évaluations mutuelles post-événement + négociation du montant de sponsoring
-- + vitrine par défaut réutilisable sur le profil entreprise.

-- Chaque engagement (ligne sponsors) peut être noté une fois dans chaque sens :
-- l'organisateur note l'entreprise, l'entreprise note l'organisation. Les notes
-- ne sont possibles qu'après l'événement, sur un sponsoring confirmé.
CREATE TABLE sponsor_reviews (
  id TEXT PRIMARY KEY,
  sponsor_id TEXT NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  rated_by TEXT NOT NULL CHECK (rated_by IN ('organizer','company')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (sponsor_id, rated_by)
);
CREATE INDEX idx_sponsor_reviews_sponsor ON sponsor_reviews(sponsor_id);

-- Négociation : après son engagement, l'entreprise peut contre-proposer un montant.
-- L'organisateur accepte (amount_cents prend la valeur proposée) ou refuse (le
-- montant du palier reste). proposal_status : NULL = aucune, pending, accepted, rejected.
ALTER TABLE sponsors ADD COLUMN proposed_cents INTEGER;
ALTER TABLE sponsors ADD COLUMN proposed_message TEXT;
ALTER TABLE sponsors ADD COLUMN proposed_at TEXT;
ALTER TABLE sponsors ADD COLUMN proposal_status TEXT
  CHECK (proposal_status IN ('pending','accepted','rejected'));

-- Vitrine par défaut : la vidéo de présentation rejoint le profil entreprise
-- (description, contacts et réseaux y sont déjà) pour préremplir chaque vitrine.
ALTER TABLE companies ADD COLUMN video_url TEXT;
