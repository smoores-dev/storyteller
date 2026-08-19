/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx}": "yarn eslint --fix",
  "*.{js,jsx,ts,tsx,json}": ["yarn prettier --write", () => "yarn check:types"],
  "*.{md,yaml,yml,json,sql}": "yarn prettier --write",
  "applications/web/migrations/*.sql": ["./scripts/dump-schema.sh"],
  "libraries/epub/*": () => [
    "yarn workspace @storyteller-platform/epub readme",
    "git add libraries/epub/README.md",
  ],
  "applications/web/src/env.ts": () =>
    "tsx ./applications/web/scripts/generate-env-docs.ts",
  "applications/docs/docs/installation/self-hosting.md": () =>
    "tsx ./applications/web/scripts/generate-env-docs.ts --check",
}

export default config
