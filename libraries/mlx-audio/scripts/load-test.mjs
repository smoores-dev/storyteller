import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import requireBinding from "node-gyp-build"

const packageDir = resolve(import.meta.dirname, "..")
const native = requireBinding(packageDir)
const missing = ["describe"].filter((n) => typeof native[n] !== "function")
if (missing.length > 0) throw new Error(`missing exports ${missing.join(", ")}`)

// MLX needs its shader library next to the binding, see scripts/fetch-metallib.mjs
const metallib = readFileSync(
  join(
    packageDir,
    "prebuilds",
    `${process.platform}-${process.arch}`,
    "mlx.metallib",
  ),
)
if (metallib.subarray(0, 4).toString("latin1") !== "MTLB") {
  throw new Error("the prebuilt mlx.metallib is not a metal library")
}
console.log("ok")
