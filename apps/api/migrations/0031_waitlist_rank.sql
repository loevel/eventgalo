-- Liste d'attente : rang affiché, inscription idempotente, et distinction entre
-- « je veux une place qui se libère » et « prévenez-moi quand ça ouvre ».
--
-- Jusqu'ici le formulaire ne s'affichait que sur une catégorie épuisée et ne
-- renvoyait qu'un « c'est noté » : rien ne disait au visiteur s'il était 2e ou
-- 200e, et une seconde inscription créait un doublon qui décalait tout le monde.
--
-- `kind` sépare les deux intentions dans la même table pour que l'organisateur
-- les voie au même endroit. Seules les lignes 'waitlist' sont relancées quand
-- une place se libère : prévenir un curieux qu'« une place s'est libérée » sur
-- un événement qui n'a jamais été complet n'aurait aucun sens.
ALTER TABLE waitlist ADD COLUMN kind TEXT NOT NULL DEFAULT 'waitlist';

-- Dédoublonnage avant la contrainte : on garde la plus ancienne inscription de
-- chaque personne, c'est elle qui porte son rang. (`id` est un UUID : trier
-- dessus donnerait un ordre lexicographique sans rapport avec l'ancienneté,
-- d'où le passage par `MIN(created_at)`.)
DELETE FROM waitlist WHERE rowid NOT IN (
  SELECT rowid FROM (SELECT rowid, MIN(created_at) FROM waitlist GROUP BY category_id, email)
);

CREATE UNIQUE INDEX idx_waitlist_category_email ON waitlist(category_id, email);
