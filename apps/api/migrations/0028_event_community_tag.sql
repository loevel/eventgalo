-- Association/communauté organisatrice d'un événement (ex. « Association des
-- Bandjoun de Montréal »), saisie librement par l'organisateur. Affichée sur
-- la page publique de l'événement — contenu réel et unique par page, utile au
-- référencement des associations culturelles et communautaires.

ALTER TABLE events ADD COLUMN community_tag TEXT;
