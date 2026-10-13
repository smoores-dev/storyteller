/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx}": "yarn oxlint --fix --no-error-on-unmatched-pattern",
  "*.{js,jsx,ts,tsx,json}": [
    "yarn oxfmt --no-error-on-unmatched-pattern",
    () => "yarn check:types",
  ],
  "*.{md,yaml,yml,json}": "yarn oxfmt --no-error-on-unmatched-pattern",
  "applications/web/migrations/*.sql": ["./scripts/dump-schema.sh"],
  "libraries/epub/*": () => [
    "yarn workspace @storyteller-platform/epub readme",
    "git add libraries/epub/README.md",
  ],
  "{README.md,.github/README.md}": () => [
    "tsx ./scripts/githubReadme.mts",
    "git add .github/README.md",
  ],
  "applications/web/src/env.ts": () =>
    "tsx ./applications/web/scripts/generate-env-docs.ts",
  "applications/docs/docs/installation/self-hosting.md": () =>
    "tsx ./applications/web/scripts/generate-env-docs.ts --check",
}

export default config
