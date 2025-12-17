const { typescriptRules } = require("./typescript.cjs")

exports.reactTypescriptConfig = (dirname) => ({
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: dirname,
  },
  rules: typescriptRules,
})
