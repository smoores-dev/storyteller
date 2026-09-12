/**
 * generates the standalone (precompiled, tree-shakeable) AJV validators from the
 * vendored schema registry. the output `standalone.cjs` is what the `./validate`
 * export ships, so consumers that only validate pay ~one schema tree, not all of
 * AJV.
 *
 * emitted as CommonJS: AJV's standalone code uses `require()` for its runtime
 * helpers, and a CJS module loads cleanly from both `import` and `require`
 * (named exports are picked up by Node's cjs-module-lexer) with no import.meta
 * shim. run via `yarn schemas:sync`.
 */
import fs from "node:fs"

import { Ajv } from "ajv"
import addFormats from "ajv-formats"
import standaloneCode from "ajv/dist/standalone"

import { allSchemas } from "../registry.generated.ts"
import { roots } from "../roots.generated.ts"

const ajv = new Ajv({
  allowUnionTypes: true,
  code: {
    source: true,
    optimize: true,
    esm: false,
  },
})

addFormats.default(ajv)
ajv.addSchema(allSchemas)

const standalone = standaloneCode(ajv, {
  validateFeed: roots.feed,
  validateAuth: roots.authentication,
})

fs.writeFileSync(new URL("./standalone.cjs", import.meta.url), standalone)
