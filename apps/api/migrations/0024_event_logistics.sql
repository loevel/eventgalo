-- Champs logistiques structurés supplémentaires, même patron que le
-- stationnement (0023) : accessibilité PMR, restriction d'âge, contact
-- jour J, et vestiaire.
ALTER TABLE events ADD COLUMN accessibility_available INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN accessibility_details TEXT;
ALTER TABLE events ADD COLUMN age_restriction TEXT NOT NULL DEFAULT 'all' CHECK (age_restriction IN ('all', '18+', 'other'));
ALTER TABLE events ADD COLUMN age_restriction_details TEXT;
ALTER TABLE events ADD COLUMN day_of_phone TEXT;
ALTER TABLE events ADD COLUMN coat_check_available INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN coat_check_details TEXT;
