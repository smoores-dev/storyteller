/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx}": "yarn eslint --cache --fix",
  "*.{js,jsx,ts,tsx,json}": ["yarn prettier --write", () => "yarn check:types"],
  "*.{md,yaml,yml,json}": "yarn prettier --write",
  "migrations/*.sql": "./scripts/dump-schema.sh",
}

export default config
