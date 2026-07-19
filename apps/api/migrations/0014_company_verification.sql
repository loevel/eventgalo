-- Vérification d'entreprise : email de domaine (badge « Vérifiée ») et
-- rattachement au registre d'entreprises canadien (MRAS : fédéral + provinces).
ALTER TABLE companies ADD COLUMN verified_at TEXT;            -- vérif email au domaine du site web
ALTER TABLE companies ADD COLUMN verified_domain TEXT;        -- domaine prouvé (badge lié à ce domaine)
ALTER TABLE companies ADD COLUMN registry_id TEXT;            -- NEQ / n° de société selon la juridiction
ALTER TABLE companies ADD COLUMN registry_jurisdiction TEXT;  -- QC, CC (fédéral), ON, …
ALTER TABLE companies ADD COLUMN registry_name TEXT;          -- nom légal au registre
ALTER TABLE companies ADD COLUMN registry_verified_at TEXT;
