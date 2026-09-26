import eslintPluginAstro from "eslint-plugin-astro";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**"],
  },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // `const { dropped, ...rest } = obj` is the idiom for omitting a key.
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    files: ["**/env.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },
  eslintConfigPrettier,
);
