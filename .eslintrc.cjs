const typescriptRules = {
  "@typescript-eslint/restrict-template-expressions": [
    "error",
    {
      allowNumber: true,
    },
  ],
  "@typescript-eslint/no-misused-promises": [
    "error",
    {
      checksVoidReturn: false,
    },
  ],
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
  ],
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      args: "all",
      argsIgnorePattern: "^_",
      caughtErrors: "all",
      caughtErrorsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      ignoreRestSiblings: true,
    },
  ],
}

const reactTypescriptConfig = {
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
    tsconfigRootDir: __dirname,
  },
  rules: typescriptRules,
}

module.exports = {
  plugins: ["@typescript-eslint", "@dword-design/import-alias"],
  extends: ["eslint:recommended", "prettier"],
  env: {
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
        ],
        groups: ["builtin", "external", "parent", "sibling", "index"],
        "newlines-between": "always",
        warnOnUnassignedImports: true,
      },
    ],
    "import/no-duplicates": ["error", { "prefer-inline": true }],
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
      files: ["config/tsup/**/*.js", "lint-staged.config.js"],
      parserOptions: { sourceType: "module" },
    },
    { files: ["docs/sidebars.js"], env: { commonjs: true } },
    {
      files: ["docs/**/*.ts", "docs/**/*.tsx"],
      ...reactTypescriptConfig,
      rules: {
        ...reactTypescriptConfig.rules,
        "react/jsx-uses-react": "error",
        "react/react-in-jsx-scope": "error",
      },
    },
    {
      files: ["mobile/**/*.ts", "mobile/**/*.tsx"],
      ...reactTypescriptConfig,
    },
    {
      files: ["mobile/babel.config.js"],
      env: { commonjs: true, node: true },
      rules: { "no-var-requires": "off" },
    },
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
      files: ["web/**/*.ts", "web/**/*.tsx"],
      extends: ["plugin:@typescript-eslint/strict-type-checked"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
      rules: {
        ...reactTypescriptConfig.rules,
        "@dword-design/import-alias/prefer-alias": [
          "error",
          {
            alias: {
              "@": "./src",
            },
            aliasForSubpaths: true,
          },
        ],
      },
    },
    {
      files: [
        "epub/**/*.ts",
        "audiobook/**/*.ts",
        "fs/**/*.ts",
        "path/**/*.ts",
      ],
      extends: ["plugin:@typescript-eslint/strict-type-checked"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
      rules: typescriptRules,
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
    // react compiler for web
    {
      files: ["web/**/*.ts", "web/**/*.tsx"],
      plugins: ["react-compiler"],
      rules: {
        "react-compiler/react-compiler": "error",
      },
    },
  ],
}
