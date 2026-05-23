import { exec } from "child_process"
import assert from "node:assert"
import { writeFile } from "node:fs/promises"
import { before, describe, it } from "node:test"
import { promisify } from "node:util"

import { Links, Manifest, Metadata } from "@readium/shared"

import { Epub } from "@storyteller-platform/epub"

import { generateReadiumManifest } from "../manifest.ts"
import { type ReadiumWebPublicationManifest } from "../manifest.types.ts"

const execPromise = promisify(exec)

async function createReadiumCLIManifest(path: string) {
  const { stdout, stderr } = await execPromise(
    `readium manifest ${path} --infer-page-count`,
  )

  if (stderr) {
    throw new Error(stderr)
  }

  const parsed = JSON.parse(stdout) as unknown as ReadiumWebPublicationManifest
  parsed.links = [
    {
      href: "manifest.json",
      rel: ["self"],
      type: "application/webpub+json",
    },
  ]

  return Manifest.deserialize(
    parsed,
  )?.serialize() as unknown as ReadiumWebPublicationManifest
}

void describe("generateReadiumManifest", () => {
  before(async () => {
    // install readium-manifest CLI
    await execPromise(
      `${new URL("../../../../web/install-readium-cli.sh", import.meta.url).pathname} 0.7.1`,
    )
  })

  void it("can generate a readium manifest", async () => {
    const outputPath = new URL(
      "../../__fixtures__/moby-dick.epub",
      import.meta.url,
    ).pathname

    const startEpub = performance.now()
    using epub = await Epub.fromForMetadata(outputPath)
    const manifest = await generateReadiumManifest(epub, {
      inferPageCount: true,
    })
    const endEpub = performance.now()
    const epubTime = endEpub - startEpub
    console.log(`Epub.from took ${epubTime}ms`)

    const startCli = performance.now()
    const cliManifest = await createReadiumCLIManifest(outputPath)
    const endCli = performance.now()
    const cliTime = endCli - startCli
    console.log(`createReadiumCLIManifest took ${cliTime}ms`)
    // required bc otherwise @readium/shared wont deserialize the manifest

    assert.ok(
      epubTime <= cliTime * 5,
      "epub.from should be in the same ballpark",
    )

    assert.deepStrictEqual(
      manifest.metadata.subject,
      cliManifest.metadata.subject,
      "ya",
    )

    assert.equal(
      manifest.metadata.numberOfPages,
      cliManifest.metadata.numberOfPages,
      "pagecount should agree",
    )

    // assert.deepStrictEqual(
    //   deserializedManifest.serialize(),
    //   deserializedCliManifest.serialize(),
    // )
    // compare to readium-manifest CLI output
    // assert.deepStrictEqual(manifest, cliManifest)
  })
})
