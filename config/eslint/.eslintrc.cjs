const base = require("./base.cjs")

module.exports = {
  ...base,
  root: true,
  ignorePatterns: ["node_modules"],
  env: {
    es2022: true,
    browser: false,
    node: true,
    commonjs: true,
  },
}
