import nextPlugin from "@next/eslint-plugin-next"
import reactPlugin from "eslint-plugin-react"
import hooksPlugin from "eslint-plugin-react-hooks"
import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({ resolvePluginsRelativeTo: import.meta.url })

const tsCompat = compat.extends("plugin:@typescript-eslint/recommended")

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  ...tsCompat,
  {
    files: ["docs/**/*.ts", "docs/**/*.tsx", "web/**/*.ts", "web/**/*.tsx"],
    plugins: {
      react: reactPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...reactPlugin.configs["recommended"].rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...hooksPlugin.configs.recommended.rules,
    },
    settings: {
      react: {
        version: "detect", // You can add this if you get a warning about the React version when you lint
      },
    },
  },
  {
    files: ["docs/docusaurus.config.js"],
    languageOptions: {
      sourceType: "commonjs",
    },
    rules: { "@typescript-eslint/no-var-requires": "off" },
  },
  {
    files: ["web/**/*.ts", "web/**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    ignores: ["web/.next/*", ".yarn", "assets", "docs/.docusaurus"],
  },
]

export default config
