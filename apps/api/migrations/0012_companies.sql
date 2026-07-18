-- Annuaire des sponsors : profils d'entreprises auto-gérés (phase 1 place de marché).

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),  -- un profil entreprise par compte
  name TEXT NOT NULL,
  sector TEXT,
  city TEXT,
  description TEXT,
  website TEXT,
  phone TEXT,
  public_email TEXT,
  socials TEXT,                       -- JSON, mêmes clés que les vitrines sponsors
  logo_key TEXT,                      -- objet R2 (companies/<id>)
  logo_type TEXT,
  listed INTEGER NOT NULL DEFAULT 0,  -- opt-in : visible dans l'annuaire public
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_companies_listed ON companies(listed);

-- Rattachement d'un sponsoring d'événement à un profil entreprise (import/claim).
ALTER TABLE sponsors ADD COLUMN company_id TEXT REFERENCES companies(id);
