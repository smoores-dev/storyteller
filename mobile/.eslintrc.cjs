const base = require("@storyteller-platform/eslint/base")
const { reactTypescriptConfig } = require("@storyteller-platform/eslint/react")

const config = reactTypescriptConfig(__dirname)

module.exports = {
  ...base,
  root: true,
  ignorePatterns: ["node_modules", "/ios", "/android"],
  overrides: [
    {
      files: ["scripts/pre-install.mjs"],
      env: { browser: false, node: true, commonjs: false },
      parserOptions: {
        sourceType: "module",
      },
    },
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
      files: ["babel.config.js", "tailwind.config.js", "metro.config.js"],
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
      plugins: ["react-compiler"],
      ...config,
      rules: {
        ...config.rules,
        "react-compiler/react-compiler": "error",
        "@dword-design/import-alias/prefer-alias": [
          "error",
          { alias: { "@": "./" }, aliasForSubpaths: true },
        ],
      },
    },
  ],
}
