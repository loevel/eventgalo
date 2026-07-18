-- Avantages inclus par catégorie de billet (JSON : tableau de chaînes libres,
-- ex. ["3 bouteilles de vin", "2 bouteilles de whisky 12 ans d'âge"])
ALTER TABLE ticket_categories ADD COLUMN perks TEXT;
