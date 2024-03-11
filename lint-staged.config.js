/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx,json}": [
    "yarn eslint --cache --fix",
    "yarn prettier --write",
    () => "yarn check:types",
  ],
  "*.{md,yaml,yml,json}": "yarn prettier --write",
  "*.py": ["poetry run black", () => "poetry run yarn pyright"],
  "migrations/*.sql": "./scripts/dump-schema.sh",
}

export default config
