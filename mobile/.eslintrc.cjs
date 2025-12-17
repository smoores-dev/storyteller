const base = require("@storyteller-platform/eslint/base")
const { reactTypescriptConfig } = require("@storyteller-platform/eslint/react")

module.exports = {
  ...base,
  root: true,
  ignorePatterns: ["node_modules", "/ios", "/android"],
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
      files: ["babel.config.js"],
      env: {
        node: true,
        commonjs: true,
      },
      rules: {
        "no-var-requires": "off",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      ...reactTypescriptConfig(__dirname),
    },
  ],
}
