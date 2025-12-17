const base = require("@storyteller-platform/eslint/base")

module.exports = {
  ...base,
  root: true,
  ignorePatterns: ["node_modules"],
  overrides: [
    {
      files: [".eslintrc.cjs"],
      env: {
        es2022: true,
        browser: false,
        node: true,
        commonjs: true,
      },
    },
    {
      files: ["**/*.js"],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  ],
}
