import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ZipFile } from "yazl"

import { Epub, EpubVersionError, MemoryAdapter } from "./index.ts"

async function buildZip(
  entries: Record<string, string | Buffer>,
): Promise<Buffer> {
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from("application/epub+zip"), "mimetype", {
    compress: false,
  })
  for (const [name, contents] of Object.entries(entries)) {
    zip.addBuffer(
      Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
      name,
    )
  }
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const CHAPTER_XHTML = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter One</title></head>
<body><h1>Chapter One</h1><p>Hello.</p></body>
</html>
`

const TOC_NCX = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="test-prefixed-epub2"/></head>
  <docTitle><text>Prefixed Book</text></docTitle>
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Chapter One</text></navLabel>
      <content src="chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>
`

function prefixedOpf(extraManifestItems = ""): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ns0:package xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ns0="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">
  <ns0:metadata>
    <dc:title>Prefixed Book</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">test-prefixed-epub2</dc:identifier>
    <dc:creator ns0:file-as="Author, Test" ns0:role="aut">Test Author</dc:creator>
  </ns0:metadata>
  <ns0:manifest>
    <ns0:item href="chapter.xhtml" id="chapter" media-type="application/xhtml+xml" />
    <ns0:item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml" />${extraManifestItems}
  </ns0:manifest>
  <ns0:spine toc="ncx">
    <ns0:itemref idref="chapter" />
  </ns0:spine>
</ns0:package>
`
}

async function buildPrefixedEpub2(): Promise<Buffer> {
  return buildZip({
    "META-INF/container.xml": CONTAINER_XML,
    "content.opf": prefixedOpf(),
    "chapter.xhtml": CHAPTER_XHTML,
    "toc.ncx": TOC_NCX,
  })
}

void describe("zips with trailing junk after the end of central directory record", () => {
  void it("opens an epub 3 buffer with trailing junk", async () => {
    const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
    const junked = Buffer.concat([intact, Buffer.from([0x3c, 0x34])])

    await assert.rejects(async () => {
      const { fromBuffer } = await import("yauzl-promise")
      await fromBuffer(junked)
    }, /End of Central Directory/i)

    using epub = await Epub.using(MemoryAdapter).from(junked)
    assert.strictEqual(await epub.getTitle(), "Moby Dick; Or, The Whale")
  })

  void it("opens an epub file on disk with trailing junk", async () => {
    const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
    const junked = Buffer.concat([intact, Buffer.from("junk")])
    const dir = await mkdtemp(join(tmpdir(), "epub-junk-test-"))
    const path = join(dir, "junked.epub")
    await writeFile(path, junked)

    using epub = await Epub.using(MemoryAdapter).from(path)
    assert.strictEqual(await epub.getTitle(), "Moby Dick; Or, The Whale")
  })

  void it("survives trailing junk that contains a fake end record signature", async () => {
    const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
    const fakeRecord = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      Buffer.alloc(18, 0xff),
    ])
    const junked = Buffer.concat([intact, fakeRecord])
    const dir = await mkdtemp(join(tmpdir(), "epub-junk-test-"))
    const path = join(dir, "fake-record.epub")
    await writeFile(path, junked)

    using epub = await Epub.using(MemoryAdapter).from(path)
    assert.strictEqual(await epub.getTitle(), "Moby Dick; Or, The Whale")
  })

  void it("reports an epub 2 with trailing junk as a version error, not a zip error", async () => {
    const intact = await readFile(join("__fixtures__", "epub-2.epub"))
    const junked = Buffer.concat([intact, Buffer.from([0x00, 0x00])])

    await assert.rejects(
      Epub.using(MemoryAdapter).from(junked),
      EpubVersionError,
    )
  })
})

void describe("opf documents with a prefixed package namespace", () => {
  void it("recognizes a prefixed epub 2 as epub 2 instead of failing to parse", async () => {
    const data = await buildPrefixedEpub2()
    await assert.rejects(Epub.using(MemoryAdapter).from(data), EpubVersionError)
  })

  void it("upgrades a prefixed epub 2 and preserves its metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "epub-prefixed-test-"))
    const inputPath = join(dir, "prefixed.epub")
    const outputPath = join(dir, "prefixed-epub3.epub")
    await writeFile(inputPath, await buildPrefixedEpub2())

    {
      using upgraded = await Epub.upgrade(inputPath, { outputPath })
      await upgraded.saveAndClose()
    }

    using epub3 = await Epub.using(MemoryAdapter).from(outputPath)
    assert.strictEqual(await epub3.getVersion(), "3.0")
    assert.strictEqual(await epub3.getTitle(), "Prefixed Book")

    const creators = await epub3.getCreators()
    assert.strictEqual(creators.length, 1)
    assert.strictEqual(creators[0]?.name, "Test Author")
    assert.strictEqual(creators[0].role, "aut")
    assert.strictEqual(creators[0].fileAs, "Author, Test")

    const spineItems = await epub3.getSpineItems()
    assert.strictEqual(spineItems.length, 1)
  })
})

void describe("failed upgrades", () => {
  void it("does not leave extracted temp directories behind", async () => {
    const canary = `leak-canary-${randomUUID()}.txt`
    const broken = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": prefixedOpf(
        `\n    <ns0:item href="missing.xhtml" id="missing" media-type="application/xhtml+xml" />`,
      ),
      "chapter.xhtml": CHAPTER_XHTML,
      "toc.ncx": TOC_NCX,
      [canary]: "canary",
    })

    const dir = await mkdtemp(join(tmpdir(), "epub-leak-test-"))
    const inputPath = join(dir, "broken.epub")
    await writeFile(inputPath, broken)

    await assert.rejects(Epub.upgrade(inputPath))

    const leaked: string[] = []
    for (const entry of await readdir(tmpdir())) {
      if (!entry.startsWith("storyteller-platform-epub-")) continue
      try {
        const contents = await readdir(join(tmpdir(), entry))
        if (contents.includes(canary)) leaked.push(entry)
      } catch {
        continue
      }
    }
    assert.deepStrictEqual(leaked, [])
  })
})
