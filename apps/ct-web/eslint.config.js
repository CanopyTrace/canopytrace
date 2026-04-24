// @ts-check
const path = require("path");
const { nextjsConfig } = require("@canopytrace/config-eslint");

module.exports = [
  { ignores: ["dist/**", "node_modules/**"] },
  ...nextjsConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: path.resolve(__dirname, "tsconfig.eslint.json"),
      },
    },
  },
];
