const base = require("@storyteller-platform/eslint/base")

module.exports = {
  ...base,
  ignorePatterns: ["/*", "!/.eslintrc.cjs", "!/lint-staged.config.js"],
  env: {
    es2022: true,
    browser: false,
    node: true,
    commonjs: true,
  },
  overrides: [
    {
      files: ["lint-staged.config.js"],
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ],
}
