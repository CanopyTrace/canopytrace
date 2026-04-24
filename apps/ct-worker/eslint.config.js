// @ts-check
const path = require("path");
const { nodeConfig } = require("@canopytrace/config-eslint");

module.exports = [
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
