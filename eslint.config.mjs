import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "skills-external/**",
      "runtime/state/**",
      "mcp-servers/**/node_modules/**",
      "knowledge/**",
      "templates/**",
    ],
  },
  {
    files: [
      "src/**/*.{ts,js,mjs}",
      "tools/**/*.{ts,js,mjs}",
      "scripts/**/*.{ts,js,mjs}",
      "test/**/*.{ts,js,mjs}",
      "packages/**/*.{ts,js,mjs}",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-control-regex": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-undef": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "prefer-const": "off",
      "preserve-caught-error": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-regex-spaces": "off",
      "no-irregular-whitespace": "off",
    },
  },
)
