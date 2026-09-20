import type { PrismTheme } from "prism-react-renderer"

/**
 * Syntax theme for code blocks.
 *
 * The stock github/dracula themes are cold against the warm palette the rest of
 * the site uses, so this maps prism's token types onto the --st-code-* vars
 * defined in src/css/custom.css. Docusaurus copies `plain` into the
 * --prism-color / --prism-background-color custom properties and applies the
 * `styles` entries as inline styles, and both paths pass the string through
 * untouched — so a var() reference resolves at paint time. That means one theme
 * object works for light and dark, since the vars themselves flip with
 * [data-theme].
 *
 */
export const prismTheme: PrismTheme = {
  plain: {
    color: "var(--st-code-plain)",
    backgroundColor: "var(--st-code-bg)",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "var(--st-code-comment)", fontStyle: "italic" },
    },
    {
      types: ["punctuation"],
      style: { color: "var(--st-code-punctuation)" },
    },
    {
      types: ["operator", "entity", "url"],
      style: { color: "var(--st-code-operator)" },
    },
    {
      types: [
        "keyword",
        "atrule",
        "rule",
        "important",
        "tag",
        "selector",
        "deleted",
      ],
      style: { color: "var(--st-code-keyword)" },
    },
    {
      types: ["string", "char", "attr-value", "inserted", "regex"],
      style: { color: "var(--st-code-string)" },
    },
    {
      types: ["number", "boolean", "constant", "symbol"],
      style: { color: "var(--st-code-number)" },
    },
    {
      types: ["function", "class-name", "builtin", "maybe-class-name"],
      style: { color: "var(--st-code-function)" },
    },
    {
      types: [
        "variable",
        "property",
        "attr-name",
        "parameter",
        "assign-left",
        "environment",
        "key",
      ],
      style: { color: "var(--st-code-variable)" },
    },
    {
      types: ["namespace"],
      style: { opacity: 0.7 },
    },
  ],
}
