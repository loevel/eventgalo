-- Profils « professionnel indépendant » (courtier, conseiller, artisan…) :
-- le profil porte le nom de la personne, avec métier et bannière d'affiliation.
-- Évite les doublons de bannière dans l'annuaire (chaque pro a son profil) et
-- permet une vérification honnête (affiliation, pas propriété du domaine).
ALTER TABLE companies ADD COLUMN kind TEXT NOT NULL DEFAULT 'company';  -- company | professional
ALTER TABLE companies ADD COLUMN title TEXT;        -- métier (« Courtier immobilier résidentiel »)
ALTER TABLE companies ADD COLUMN affiliation TEXT;  -- bannière / réseau (« RE/MAX Québec »)
