module.exports = {
  plugins: ["@typescript-eslint", "@dword-design/import-alias", "import"],
  extends: ["eslint:recommended", "prettier"],
  env: {
    es2022: true,
    browser: true,
    es2023: true,
  },
  rules: {
    "no-console": ["error", { allow: ["warn", "error"] }],
    "import/order": [
      "error",
      {
        alphabetize: {
          order: "asc",
        },
        named: true,
        pathGroupsExcludedImportTypes: ["builtin", "object"],
        pathGroups: [
          {
            pattern: "@storyteller-platform/**",
            group: "external",
            position: "after",
          },
          {
            pattern: "@/**",
            group: "parent",
            position: "before",
          },
          {
            pattern: "@v3/**",
            group: "parent",
            position: "before",
          },
        ],
        groups: ["builtin", "external", "parent", "sibling", "index"],
        "newlines-between": "always",
        warnOnUnassignedImports: true,
      },
    ],
    "import/no-duplicates": ["error", { "prefer-inline": true }],
  },
}
