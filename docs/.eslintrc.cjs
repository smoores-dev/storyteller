const base = require("@storyteller-platform/eslint/base")
const { reactTypescriptConfig } = require("@storyteller-platform/eslint/react")

const config = reactTypescriptConfig(__dirname)

module.exports = {
  ...base,
  root: true,
  ignorePatterns: ["node_modules", "public/assets", "tsbuild"],
  overrides: [
    {
      files: [".eslintrc.cjs", "docusaurus.config.js"],
      env: {
        es2022: true,
        browser: false,
        node: true,
        commonjs: true,
      },
    },
    {
      files: ["sidebars.js", "sidebarsContributing.js"],
      env: {
        commonjs: true,
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      ...config,
      rules: {
        ...config.rules,
        "react/jsx-uses-react": "error",
        "react/react-in-jsx-scope": "error",
      },
    },
  ],
}
