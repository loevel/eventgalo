import { getRequestConfig } from "next-intl/server";

// Locale statique pour l'instant : pas de routing par préfixe (/fr/, /en/) tant
// qu'aucun contenu anglais n'existe — voir la section i18n du README pour le
// choix et la marche à suivre pour ajouter une locale plus tard.
export default getRequestConfig(async () => {
  const locale = "fr";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
