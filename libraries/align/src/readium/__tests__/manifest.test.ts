import { exec } from "child_process"
import assert from "node:assert"
import { before, describe, it } from "node:test"
import { promisify } from "node:util"

import { Manifest } from "@readium/shared"

import { Epub, MemoryAdapter } from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

import { generateReadiumManifest } from "../manifest.ts"
import { type ReadiumWebPublicationManifest } from "../manifest.types.ts"

const execPromise = promisify(exec)

async function createReadiumCLIManifest(
  path: string,
): Promise<ReadiumWebPublicationManifest> {
  const { stdout, stderr } = await execPromise(
    `readium manifest ${path} --infer-page-count`,
  )
  if (stderr) throw new Error(stderr)

  const parsed = JSON.parse(stdout) as ReadiumWebPublicationManifest
  // bug in readium cli, does not output links
  // or bug in readium shared depending on how you think about it
  parsed.links = [
    {
      href: "manifest.json",
      rel: ["self"],
      type: MediaType.WEBPUB_MANIFEST.mime,
    },
  ]
  const deserialized = Manifest.deserialize(parsed)
  assert.ok(deserialized, "cli manifest should deserialize")
  return deserialized.serialize() as ReadiumWebPublicationManifest
}

function hrefList(links: { href: string }[] | undefined): string[] {
  return (links ?? []).map((l) => l.href).sort()
}

function flattenTocHrefs(
  links: { href: string; children?: { href: string }[] }[] | undefined,
): string[] {
  const out: string[] = []
  const walk = (
    items: { href: string; children?: { href: string }[] }[] | undefined,
  ) => {
    if (!items) return
    for (const item of items) {
      out.push(item.href)
      walk(item.children)
    }
  }
  walk(links)
  return out.sort()
}

void describe("generateReadiumManifest", () => {
  before(async () => {
    await execPromise(
      `${new URL("../../../../../applications/web/install-readium-cli.sh", import.meta.url).pathname} 0.7.1`,
    )
  })

  void it("matches the readium cli on moby-dick", async () => {
    const outputPath = new URL(
      "../../__fixtures__/moby-dick.epub",
      import.meta.url,
    ).pathname

    const startEpub = performance.now()
    using epub = await Epub.using(MemoryAdapter).from(outputPath)
    const raw = await generateReadiumManifest(epub, { inferPageCount: true })
    const endEpub = performance.now()
    const epubTime = endEpub - startEpub

    const deserialized = Manifest.deserialize(raw)
    assert.ok(deserialized, "ours should deserialize")
    const ours = deserialized.serialize() as ReadiumWebPublicationManifest

    const startCli = performance.now()
    const cli = await createReadiumCLIManifest(outputPath)
    const endCli = performance.now()
    const cliTime = endCli - startCli

    if (process.env["EPUB_PERF"]) {
      // eslint-disable-next-line no-console
      console.log(
        `Epub.using(MemoryAdapter) + generateReadiumManifest took ${epubTime}ms; ` +
          `readium cli took ${cliTime}ms`,
      )
      assert.ok(
        epubTime <= cliTime * 5,
        "in-process manifest should be in the same ballpark as the cli",
      )
    }

    // ---- must match exactly ----

    assert.deepStrictEqual(
      ours.metadata.title,
      cli.metadata.title,
      "title should match",
    )
    assert.strictEqual(
      ours.metadata.identifier,
      cli.metadata.identifier,
      "identifier should match",
    )
    assert.deepStrictEqual(
      ours.metadata.language,
      cli.metadata.language,
      "language should match",
    )
    assert.strictEqual(
      ours.readingOrder.length,
      cli.readingOrder.length,
      "readingOrder length should match",
    )
    assert.deepStrictEqual(
      hrefList(ours.readingOrder),
      hrefList(cli.readingOrder),
      "readingOrder hrefs should match",
    )
    assert.deepStrictEqual(
      flattenTocHrefs(ours.toc),
      flattenTocHrefs(cli.toc),
      "toc href tree should match",
    )

    const ourPages = ours.metadata.numberOfPages
    const cliPages = cli.metadata.numberOfPages
    assert.ok(
      typeof ourPages === "number" && typeof cliPages === "number",
      "both should infer a page count",
    )
    const pageDelta = Math.abs(ourPages - cliPages)
    const pageTolerance = Math.max(2, Math.ceil(cliPages * 0.05))
    assert.ok(
      pageDelta <= pageTolerance,
      `numberOfPages within ±${pageTolerance} (ours=${ourPages}, cli=${cliPages})`,
    )

    const ourResourceHrefs = new Set(hrefList(ours.resources))
    for (const cliResource of cli.resources ?? []) {
      assert.ok(
        ourResourceHrefs.has(cliResource.href),
        `cli resource ${cliResource.href} should appear in ours`,
      )
    }
  })
})
