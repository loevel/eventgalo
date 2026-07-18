-- Identité visuelle de l'événement + sponsoring.

-- Logo de l'association organisatrice (même mécanique que cover_media_id).
ALTER TABLE events ADD COLUMN logo_media_id TEXT REFERENCES media(id);

-- Photo mise en avant dans la galerie publique de la page événement.
ALTER TABLE media ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

-- Paliers de sponsoring (ex. Sponsor officiel, Or, Argent, Standard).
CREATE TABLE sponsor_tiers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  quantity INTEGER NOT NULL DEFAULT 1,   -- nombre de places de sponsoring sur ce palier
  perks TEXT,                            -- JSON : avantages offerts au sponsor
  rank INTEGER NOT NULL DEFAULT 0,       -- 0 = palier le plus prestigieux (affiché en premier/plus grand)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sponsor_tiers_event ON sponsor_tiers(event_id);

-- Sponsors : entreprises invitées par lien privé, engagement puis confirmation.
CREATE TABLE sponsors (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id TEXT REFERENCES sponsor_tiers(id),   -- choisi par l'entreprise via le lien
  company_name TEXT,
  website TEXT,
  logo_media_id TEXT REFERENCES media(id),
  contact_name TEXT,
  contact_email TEXT NOT NULL,
  message TEXT,                                -- mot du sponsor / note à l'organisateur
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','pending','confirmed','declined')),
  token TEXT NOT NULL UNIQUE,                  -- lien privé /sp/<token>
  amount_cents INTEGER,                        -- montant engagé (copié du palier au moment du choix)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  committed_at TEXT,                           -- date d'engagement de l'entreprise
  confirmed_at TEXT                            -- date de confirmation par l'organisateur
);
CREATE INDEX idx_sponsors_event ON sponsors(event_id);
