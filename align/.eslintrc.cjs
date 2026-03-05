const base = require("@storyteller-platform/eslint/base")
const { typescriptRules } = require("@storyteller-platform/eslint/typescript")

module.exports = {
  ...base,
  root: true,
  ignorePatterns: [
    "node_modules",
    "/dist",
    "/tsup.config.ts",
    "/scripts/bundle.js",
  ],
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
      files: ["**/*.ts"],
      extends: ["plugin:@typescript-eslint/strict-type-checked"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
      rules: typescriptRules,
    },
    {
      files: ["**/*.test.ts"],
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
}
