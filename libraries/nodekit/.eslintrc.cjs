const base = require("@storyteller-platform/eslint/base")
const { typescriptRules } = require("@storyteller-platform/eslint/typescript")

module.exports = {
  ...base,
  root: true,
  ignorePatterns: ["node_modules", "/dist", "/npm", "/tsup.config.ts"],
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
    {
      files: ["scripts/*.mjs"],
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      env: {
        es2022: true,
        browser: false,
        node: true,
      },
      rules: {
        "no-console": "off",
      },
    },
    ...base.overrides,
  ],
}
