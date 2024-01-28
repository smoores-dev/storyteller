/** @type {import('lint-staged').Config} */
const config = {
  "*.[jt]sx?": ["yarn eslint --cache --fix", "yarn prettier --write"],
  "*.{js,jsx,ts,tsx,json}": () => "yarn check:types",
  "*.{md,yaml,yml,json}": "yarn prettier --write",
}

export default config
