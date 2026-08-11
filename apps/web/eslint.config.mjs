import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".open-next/**", ".turbo/**", ".wrangler/**", "next-env.d.ts"]),
  {
    // Règles de préparation au React Compiler (eslint-plugin-react-hooks v6+) : elles
    // flaggent en erreur des motifs pourtant corrects tant qu'on ne cible pas le
    // Compiler (lire window/URLSearchParams dans un effect au montage, Date.now()
    // dans un useMemo, synchroniser un ref de callback pendant le rendu). On les
    // garde visibles en avertissement plutôt que de les faire disparaître.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Dette connue : ces fichiers typent leurs réponses API en `Record<string, any>`
    // de façon large et cohérente plutôt que via de vraies interfaces (voir la
    // phase 3 du plan de résolution — introduction progressive de zod). On
    // l'abaisse en avertissement ici pour ne pas bloquer la CI ; la règle reste
    // en erreur partout ailleurs, donc tout nouveau fichier doit typer correctement
    // dès le départ.
    files: [
      // Les dossiers de routes dynamiques Next.js utilisent des crochets littéraux
      // ([id], [token]…) qu'il faut échapper : en syntaxe glob, [id] sans échappement
      // désigne une classe de caractères ("i" ou "d"), pas le texte "[id]".
      "app/dashboard/e/\\[id\\]/page.tsx",
      // Onglets extraits de la page ci-dessus : le fichier de 2 800 lignes a été
      // découpé, mais la dette de typage a simplement suivi le code — elle n'a
      // été ni créée ni aggravée par le découpage, et la solder relève du même
      // chantier zod que la ligne précédente.
      "app/dashboard/e/\\[id\\]/_components/*.tsx",
      "app/dashboard/e/\\[id\\]/edit/page.tsx",
      "app/i/\\[token\\]/page.tsx",
      "app/s/\\[code\\]/page.tsx",
      "app/scan/page.tsx",
      "app/t/\\[serial\\]/page.tsx",
      "components/event-form.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
