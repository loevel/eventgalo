-- Programme structuré de la soirée (heure + libellé), en remplacement du
-- texte libre pour le déroulé — JSON: [{"time":"18h00","label":"Cocktail"}, …].
ALTER TABLE events ADD COLUMN agenda TEXT;
