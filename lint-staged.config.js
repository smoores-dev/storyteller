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
    "yarn workspace @smoores/epub readme",
    "git add epub/README.md",
  ],
}

export default config
