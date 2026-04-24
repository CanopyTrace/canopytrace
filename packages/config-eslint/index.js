// @ts-check
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const importPlugin = require("eslint-plugin-import");
const prettierConfig = require("eslint-config-prettier");

/** @type {import("eslint").Linter.FlatConfig[]} */
const nodeConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: true,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      // TypeScript strict rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
        },
      ],
      // Import ordering
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],
      // General
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  // Disable rules that conflict with Prettier
  prettierConfig,
];

/** @type {import("eslint").Linter.FlatConfig[]} */
const nextjsConfig = [
  ...nodeConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Next.js uses default exports for pages/layouts
      "import/prefer-default-export": "off",
    },
  },
];

module.exports = { nodeConfig, nextjsConfig };
