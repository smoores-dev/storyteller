module.exports = {
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "prettier"],
  env: {
    browser: true,
    es2023: true,
  },
  overrides: [
    {
      files: [
        ".eslintrc.cjs",
        "lint-staged.config.js",
        "web/next.config.js",
        "docs/babel.config.js",
        "docs/docusaurus.config.js",
      ],
      env: { browser: false, node: true, commonjs: true },
    },
    {
      files: ["lint-staged.config.js"],
      parserOptions: { sourceType: "module" },
    },
    { files: ["docs/sidebars.js"], env: { commonjs: true } },
    {
      files: ["web/**/*"],
      extends: ["next"],
      settings: {
        next: {
          rootDir: ["web"],
        },
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      extends: ["plugin:@typescript-eslint/strict"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
}