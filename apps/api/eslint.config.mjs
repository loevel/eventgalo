import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", ".wrangler/**", ".turbo/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Convention du repo : préfixer par `_` un champ intentionnellement omis
      // d'une réponse, ex. `const { token: _token, ...safe } = obj`.
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // Les tests inspectent des corps de réponse JSON arbitraires sans redéfinir
      // une interface complète pour chaque route.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
