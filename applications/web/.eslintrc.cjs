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
    "next-env.d.ts",
    "messages/**/*.d.json.ts",
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
      rules: {
        "@next/next/no-img-element": "off",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      ...config,
      extends: ["plugin:@typescript-eslint/strict-type-checked"],
      plugins: ["react-compiler"],
      rules: {
        ...config.rules,
        "no-empty": ["error", { allowEmptyCatch: true }],
        "react-compiler/react-compiler": "error",
        "@dword-design/import-alias/prefer-alias": [
          "error",
          { alias: { "@": "./src" }, aliasForSubpaths: true },
        ],
        "no-restricted-syntax": [
          "error",
          {
            selector:
              "MemberExpression[object.name=/form/i] > Identifier[name='watch']",
            message:
              "Do not use form.watch, it does not work with the React compiler. Use react-hook-form's useWatch instead.",
          },
          {
            selector: "Identifier[name='useTranslations']",
            message:
              "Do not use next-intl's useTranslations hook, it won't automatically create correct markup. Use useTranslation instead. If you need plain text, use t.plain instead.",
          },
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
    {
      files: ["app/(v3)/**/*.ts", "app/(v3)/**/*.tsx"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@tabler/icons-react",
                message:
                  'Import from "@/icons" instead. Only web/src/icons/source.tsx may import from @tabler/icons-react directly.',
              },
            ],
          },
        ],
      },
    },
    ...base.overrides,
  ],
}
