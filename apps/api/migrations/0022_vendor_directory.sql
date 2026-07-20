-- Annuaire des prestataires (photographes, salles, traiteurs, musiciens...) :
-- réutilise le profil entreprise existant, avec un axe de visibilité indépendant
-- de l'annuaire sponsors (`listed`).
ALTER TABLE companies ADD COLUMN vendor_listed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_companies_vendor_listed ON companies(vendor_listed);
