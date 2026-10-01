/**
 * Development-mode entry point used by the JSX transform.
 *
 * Transforms compiling in development mode import `jsxDEV` from
 * `<jsxImportSource>/jsx-dev-runtime` rather than from `<jsxImportSource>/jsx-runtime`,
 * so the subpath has to resolve. There is no separate development behaviour
 * here: XML has no key reconciliation to warn about.
 */

export { Fragment, jsx, jsxDEV, jsxs } from "./jsx-runtime.ts"
