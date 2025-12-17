exports.typescriptRules = {
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
