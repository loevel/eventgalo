-- Email « les photos de la soirée sont en ligne », envoyé après l'événement.
--
-- C'est le seul message que la plateforme envoie à un participant après coup :
-- il rouvre la fiche publique au moment où l'envie de revoir la soirée est la
-- plus forte, et sert le prochain événement du même organisateur juste dessous.
--
-- Trois marqueurs plutôt qu'un seul : les marqueurs par destinataire rendent
-- l'envoi reprenable (un gala de 400 personnes dépasse le budget de sous-requêtes
-- d'une invocation, l'exécution suivante reprend là où on s'est arrêté), et le
-- marqueur sur l'événement clôt le dossier pour que le balayage cesse de le voir.
ALTER TABLE events ADD COLUMN recap_sent_at TEXT;
ALTER TABLE tickets ADD COLUMN recap_sent_at TEXT;
ALTER TABLE guests ADD COLUMN recap_sent_at TEXT;
