/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx}": "yarn eslint --fix",
  "*.{js,jsx,ts,tsx,json}": ["yarn prettier --write", () => "yarn check:types"],
  "*.{md,yaml,yml,json,sql}": "yarn prettier --write",
  "web/migrations/*.sql": [
    "./scripts/dump-schema.sh",
    () => "yarn prettier --write schema.sql",
  ],
  "epub/*": () => [
    "yarn workspace @storyteller-platform/epub readme",
    "git add epub/README.md",
  ],
  "web/src/env.ts": () => "tsx ./web/scripts/generate-env-docs.ts",
  "docs/docs/installation/self-hosting.md": () =>
    "tsx ./web/scripts/generate-env-docs.ts --check",
}

export default config
