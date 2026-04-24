// @ts-check
const path = require("path");
const { nodeConfig } = require("@canopytrace/config-eslint");

module.exports = [
  { ignores: ["dist/**", "node_modules/**"] },
  ...nodeConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: path.resolve(__dirname, "tsconfig.eslint.json"),
      },
    },
  },
];
