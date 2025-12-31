const base = require("@storyteller-platform/eslint/base")
const { reactTypescriptConfig } = require("@storyteller-platform/eslint/react")

const config = reactTypescriptConfig(__dirname)

module.exports = {
  ...base,
  plugins: base.plugins.filter((p) => p !== "import"),
  root: true,
  ignorePatterns: [
    "work-dist",
    "file-write-dist",
    ".next",
    "node_modules",
    "/assets",
    "/cache",
    "/dev-data",
    "whisper-builds",
    "tsbuild",
    "next-env.d.ts"
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
      files: ["**/*"],
      extends: ["next"],
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      ...config,
      extends: ["plugin:@typescript-eslint/strict-type-checked"],
      plugins: ["react-compiler"],
      rules: {
        ...config.rules,
        "react-compiler/react-compiler": "error",
        "@dword-design/import-alias/prefer-alias": [
          "error",
          { alias: { "@": "./src" }, aliasForSubpaths: true },
        ],
      },
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      parser: config.parser,
      parserOptions: config.parserOptions,
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
}
