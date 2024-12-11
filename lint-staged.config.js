/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx}": "yarn eslint --fix",
  "*.{js,jsx,ts,tsx,json}": ["yarn prettier --write", () => "yarn check:types"],
  "*.{md,yaml,yml,json}": "yarn prettier --write",
  "migrations/*.sql": "./scripts/dump-schema.sh",
  "epub/*": () => [
    "yarn workspace @smoores/epub readme",
    "git add epub/README.md",
  ],
}

export default config
