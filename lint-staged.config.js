/** @type {import('lint-staged').Config} */
const config = {
  "*.{js,jsx,ts,tsx,json}": [
    "yarn eslint --cache --fix",
    "yarn prettier --write",
    () => "yarn check:types",
  ],
  "*.{md,yaml,yml,json}": "yarn prettier --write",
  "*.py": ["poetry run black", () => "poetry run yarn pyright"],
  "migrations/*.sql": "sqlite3 storyteller.db .schema > schema.sql",
}

export default config
