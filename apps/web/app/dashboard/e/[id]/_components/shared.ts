/**
 * Valeurs partagées par les onglets du tableau de bord d'un événement.
 *
 * `WEB` sert à composer les liens publics (invitation, billet, fiche) affichés
 * et copiés depuis plusieurs onglets. Il est lu au chargement du module et non
 * au rendu : côté serveur, `window` n'existe pas et la chaîne vide donne des
 * liens relatifs, corrigés dès l'hydratation.
 */
export const WEB = typeof window !== "undefined" ? window.location.origin : "";
