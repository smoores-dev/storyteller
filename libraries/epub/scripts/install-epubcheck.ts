// installs the epubcheck jar used by upgrade.test.ts
/* eslint-disable no-console, @typescript-eslint/no-unsafe-assignment */

import fs from "node:fs"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

import { open } from "yauzl-promise"

const version = "5.3.0"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const vendorsDir = path.join(scriptDir, "..", "vendors")
const zip = path.join(vendorsDir, `epubcheck-${version}.zip`)

const jar = path.join(vendorsDir, `epubcheck-${version}`, "epubcheck.jar")

async function main() {
  if (fs.existsSync(jar)) {
    console.log(`epubcheck ${version} already installed`)
    process.exit(0)
  }

  if (!fs.existsSync(zip)) {
    console.error(`missing ${zip}`)
    console.error(
      "the vendored zip is stored in git lfs, run `git lfs pull` to fetch it",
    )
    process.exit(1)
  }

  const outputDir = path.join(vendorsDir, `epubcheck-${version}`)

  fs.mkdirSync(vendorsDir, { recursive: true })
  try {
    const zipfile = await open(zip)

    await using stack = new AsyncDisposableStack()
    stack.defer(async () => {
      await zipfile.close()
    })

    for await (const entry of zipfile) {
      if (entry.filename.endsWith("/")) {
        continue
      }

      const writePath = path.join(vendorsDir, entry.filename)
      const readStream = await entry.openReadStream()
      fs.mkdirSync(path.dirname(writePath), { recursive: true })
      const writeStream = fs.createWriteStream(writePath)
      await pipeline(readStream, writeStream)
    }
  } catch (error) {
    fs.rmSync(outputDir, { force: true, recursive: true })
    throw error
  }
  console.log(`installed epubcheck ${version} to ${vendorsDir}`)
}

void main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error("error:", error.message)
    } else {
      console.error("error:", error)
    }
    process.exit(1)
  })
  .then(() => process.exit(0))
