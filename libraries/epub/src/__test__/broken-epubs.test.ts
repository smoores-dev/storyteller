import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, it } from "vitest"
import { ZipFile } from "yazl"

import {
  Epub,
  EpubVersionError,
  MemoryAdapter,
  TmpFsAdapter,
} from "../index.tsx"

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

describe("zips with trailing junk after the end of central directory record", () => {
  it("opens an epub 3 buffer with trailing junk", async () => {
    const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
    const junked = Buffer.concat([intact, Buffer.from([0x3c, 0x34])])

    await assert.rejects(async () => {
      const { fromBuffer } = await import("yauzl-promise")
      await fromBuffer(junked)
    }, /End of Central Directory/i)

    using epub = await Epub.using(MemoryAdapter).from(junked)
    assert.strictEqual(await epub.getTitle(), "Moby Dick; Or, The Whale")
  })

  it("opens an epub file on disk with trailing junk", async () => {
    const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
    const junked = Buffer.concat([intact, Buffer.from("junk")])
    const dir = await mkdtemp(join(tmpdir(), "epub-junk-test-"))
    const path = join(dir, "junked.epub")
    await writeFile(path, junked)

    using epub = await Epub.using(MemoryAdapter).from(path)
    assert.strictEqual(await epub.getTitle(), "Moby Dick; Or, The Whale")
  })

  it("survives trailing junk that contains a fake end record signature", async () => {
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

  it("reports an epub 2 with trailing junk as a version error, not a zip error", async () => {
    const intact = await readFile(join("__fixtures__", "epub-2.epub"))
    const junked = Buffer.concat([intact, Buffer.from([0x00, 0x00])])

    await assert.rejects(
      Epub.using(MemoryAdapter).from(junked),
      EpubVersionError,
    )
  })
})

describe("opf documents with a prefixed package namespace", () => {
  it("recognizes a prefixed epub 2 as epub 2 instead of failing to parse", async () => {
    const data = await buildPrefixedEpub2()
    await assert.rejects(Epub.using(MemoryAdapter).from(data), EpubVersionError)
  })

  it("upgrades a prefixed epub 2 and preserves its metadata", async () => {
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

const ENCODED_CHAPTER_NAME =
  "Clarke, Arthur C - [Non-Fiction] The View from Serendip [v1_0001.HTML"
const ENCODED_CHAPTER_HREF = encodeURIComponent(ENCODED_CHAPTER_NAME)

function encodedHrefOpf(
  version: "2.0" | "3.0",
  chapterHref: string = ENCODED_CHAPTER_HREF,
): string {
  const navItem =
    version === "3.0"
      ? `\n    <item href="nav.xhtml" id="nav" media-type="application/xhtml+xml" properties="nav" />`
      : ""
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" unique-identifier="uid" version="${version}">
  <metadata>
    <dc:title>The View from Serendip</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">test-encoded-href</dc:identifier>
  </metadata>
  <manifest>
    <item href="${chapterHref}" id="chapter" media-type="application/xhtml+xml" />
    <item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml" />${navItem}
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter" />
  </spine>
</package>
`
}

const ENCODED_HREF_NCX = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="test-encoded-href"/></head>
  <docTitle><text>The View from Serendip</text></docTitle>
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Chapter One</text></navLabel>
      <content src="${ENCODED_CHAPTER_HREF}#top"/>
    </navPoint>
  </navMap>
</ncx>
`

const ENCODED_HREF_NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body><nav epub:type="toc"><ol><li><a href="${ENCODED_CHAPTER_HREF}#top">Chapter One</a></li></ol></nav></body>
</html>
`

describe("hrefs pointing at entries whose names need percent encoding", () => {
  it("reads an entry stored under the decoded name", async () => {
    const data = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": encodedHrefOpf("3.0"),
      [ENCODED_CHAPTER_NAME]: CHAPTER_XHTML,
      "toc.ncx": ENCODED_HREF_NCX,
      "nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    const contents = await epub.readItemContents("chapter", "utf-8")
    assert.match(contents, /Chapter One/)

    const navigation = await epub.getTableOfContents()
    assert.strictEqual(
      navigation?.children[0]?.href,
      `${ENCODED_CHAPTER_HREF}#top`,
    )
  })

  it("falls back to the name as written when the entry is stored encoded", async () => {
    const data = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": encodedHrefOpf("3.0"),
      [ENCODED_CHAPTER_HREF]: CHAPTER_XHTML,
      "toc.ncx": ENCODED_HREF_NCX,
      "nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    const contents = await epub.readItemContents("chapter", "utf-8")
    assert.match(contents, /Chapter One/)
  })

  it("reports an archive length for an entry stored encoded", async () => {
    const data = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": encodedHrefOpf("3.0"),
      [ENCODED_CHAPTER_HREF]: CHAPTER_XHTML,
      "toc.ncx": ENCODED_HREF_NCX,
      "nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    assert.ok((await epub.getItemArchiveLength("chapter")) > 0)
  })

  // We specifically do not support this use case. A filename with an unnecessarily
  // percent-encoded character (e.g. `-` -> `%2D`) MUST have a correctly encoded
  // manifest href.
  it.fails("reads an entry whose stored name encodes a character encodeURIComponent leaves bare", async () => {
    const name = "chapter%2Done.xhtml"
    const data = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": encodedHrefOpf("3.0", name),
      [name]: CHAPTER_XHTML,
      "toc.ncx": ENCODED_HREF_NCX,
      "nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    assert.match(await epub.readItemContents("chapter", "utf-8"), /Chapter One/)
    assert.ok((await epub.getItemArchiveLength("chapter")) > 0)
  })

  it("upgrades an epub 2 whose hrefs are percent encoded", async () => {
    const dir = await mkdtemp(join(tmpdir(), "epub-encoded-href-test-"))
    const inputPath = join(dir, "encoded.epub")
    const outputPath = join(dir, "encoded-epub3.epub")
    await writeFile(
      inputPath,
      await buildZip({
        "META-INF/container.xml": CONTAINER_XML,
        "content.opf": encodedHrefOpf("2.0"),
        [ENCODED_CHAPTER_NAME]: CHAPTER_XHTML,
        "toc.ncx": ENCODED_HREF_NCX,
      }),
    )

    {
      using upgraded = await Epub.upgrade(inputPath, { outputPath })
      await upgraded.saveAndClose()
    }

    using epub3 = await Epub.using(MemoryAdapter).from(outputPath)
    assert.strictEqual(await epub3.getVersion(), "3.0")

    const spineItems = await epub3.getSpineItems()
    assert.strictEqual(spineItems[0]?.href, ENCODED_CHAPTER_HREF)
    assert.match(
      await epub3.readItemContents("chapter", "utf-8"),
      /Chapter One/,
    )

    const navigation = await epub3.getTableOfContents()
    assert.strictEqual(
      navigation?.children[0]?.href,
      `${ENCODED_CHAPTER_HREF}#top`,
    )
  })
})

const UTF8_NAME_FLAG = 0x800
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_RECORD_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06])

const LOCAL_FILE_HEADER_NAME_FLAG = 6
const CENTRAL_DIRECTORY_RECORD_NAME_FLAG = 8

const END_OF_CENTRAL_DIRECTORY = {
  recordCount: 10,
  firstRecordStart: 16,
} as const

const CENTRAL_DIRECTORY_RECORD = {
  nameLength: 28,
  extraFieldLength: 30,
  fileCommentLength: 32,
  localFileHeaderStart: 42,
  size: 46,
} as const

const UNFLAGGED_CHAPTER = "Text/Ω chapter.xhtml"
const UNFLAGGED_ARTWORK = "Images/© andrewgenn - Fotolia_fmt.jpeg"
const UNFLAGGED_CHAPTER_HREF = `Text/${encodeURIComponent("Ω chapter.xhtml")}`
const UNFLAGGED_ARTWORK_HREF = `Images/${encodeURIComponent("© andrewgenn - Fotolia_fmt.jpeg")}`

const UNFLAGGED_NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body><nav epub:type="toc"><ol><li><a href="${UNFLAGGED_CHAPTER_HREF}">Chapter One</a></li></ol></nav></body>
</html>
`

function unflaggedOpf(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" unique-identifier="uid" version="3.0">
  <metadata>
    <dc:title>Fotolia</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">test-unflagged-utf8-names</dc:identifier>
  </metadata>
  <manifest>
    <item href="${UNFLAGGED_CHAPTER_HREF}" id="chapter" media-type="application/xhtml+xml" />
    <item href="${UNFLAGGED_ARTWORK_HREF}" id="artwork" media-type="image/jpeg" />
    <item href="nav.xhtml" id="nav" media-type="application/xhtml+xml" properties="nav" />
  </manifest>
  <spine>
    <itemref idref="chapter" />
  </spine>
</package>
`
}

function clearUtf8NameFlag(zip: Buffer, flagStart: number): void {
  zip.writeUInt16LE(zip.readUInt16LE(flagStart) & ~UTF8_NAME_FLAG, flagStart)
}

function withoutUtf8NameFlag(zip: Buffer): Buffer {
  const cleared = Buffer.from(zip)
  const endOfCentralDirectory = cleared.lastIndexOf(
    END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  )
  assert.notStrictEqual(
    endOfCentralDirectory,
    -1,
    "no end of central directory",
  )

  const recordCount = cleared.readUInt16LE(
    endOfCentralDirectory + END_OF_CENTRAL_DIRECTORY.recordCount,
  )
  let record = cleared.readUInt32LE(
    endOfCentralDirectory + END_OF_CENTRAL_DIRECTORY.firstRecordStart,
  )

  for (let i = 0; i < recordCount; i++) {
    assert.strictEqual(
      cleared.readUInt32LE(record),
      CENTRAL_DIRECTORY_RECORD_SIGNATURE,
    )
    clearUtf8NameFlag(cleared, record + CENTRAL_DIRECTORY_RECORD_NAME_FLAG)

    const localFileHeader = cleared.readUInt32LE(
      record + CENTRAL_DIRECTORY_RECORD.localFileHeaderStart,
    )
    assert.strictEqual(
      cleared.readUInt32LE(localFileHeader),
      LOCAL_FILE_HEADER_SIGNATURE,
    )
    clearUtf8NameFlag(cleared, localFileHeader + LOCAL_FILE_HEADER_NAME_FLAG)

    record +=
      CENTRAL_DIRECTORY_RECORD.size +
      cleared.readUInt16LE(record + CENTRAL_DIRECTORY_RECORD.nameLength) +
      cleared.readUInt16LE(record + CENTRAL_DIRECTORY_RECORD.extraFieldLength) +
      cleared.readUInt16LE(record + CENTRAL_DIRECTORY_RECORD.fileCommentLength)
  }

  return cleared
}

async function buildUnflaggedEpub(): Promise<Buffer> {
  return withoutUtf8NameFlag(
    await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": unflaggedOpf(),
      [UNFLAGGED_CHAPTER]: CHAPTER_XHTML,
      [UNFLAGGED_ARTWORK]: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]),
      "nav.xhtml": UNFLAGGED_NAV,
    }),
  )
}

describe("entry names stored as UTF-8 without the UTF-8 name flag", () => {
  it("reads an item whose entry name is UTF-8 without the name flag", async () => {
    using epub = await Epub.using(MemoryAdapter).from(
      await buildUnflaggedEpub(),
    )
    assert.match(await epub.readItemContents("chapter", "utf-8"), /Chapter One/)
  })

  it("reports the archive length of an entry whose name is UTF-8 without the name flag", async () => {
    using epub = await Epub.using(MemoryAdapter).from(
      await buildUnflaggedEpub(),
    )
    assert.ok((await epub.getItemArchiveLength("artwork")) > 0)
  })

  it("extracts entries whose names are UTF-8 without the name flag under those names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "epub-unflagged-utf8-test-"))
    const path = join(dir, "unflagged.epub")
    await writeFile(path, await buildUnflaggedEpub())

    using epub = await Epub.using(TmpFsAdapter).from(path)
    assert.match(await epub.readItemContents("chapter", "utf-8"), /Chapter One/)
    assert.ok((await epub.getItemArchiveLength("artwork")) > 0)
  })

  it("writes entry names back out undamaged when a read archive is saved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "epub-unflagged-utf8-test-"))
    const path = join(dir, "unflagged.epub")
    await writeFile(path, await buildUnflaggedEpub())

    {
      using epub = await Epub.using(TmpFsAdapter).from(path)
      await epub.saveAndClose()
    }

    const saved = await readFile(path)
    const nameAsStored = Buffer.from("©", "utf-8")
    const nameAsCp437Mojibake = Buffer.from("┬⌐", "utf-8")
    assert.ok(saved.includes(nameAsStored))
    assert.ok(!saved.includes(nameAsCp437Mojibake))

    using reopened = await Epub.using(MemoryAdapter).from(path)
    assert.match(
      await reopened.readItemContents("chapter", "utf-8"),
      /Chapter One/,
    )
    assert.ok((await reopened.getItemArchiveLength("artwork")) > 0)
  })
})

describe("hrefs that address entries outside the container", () => {
  const NESTED_CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

  it("climbs on %2E%2E the way the URL standard does", async () => {
    const data = await buildZip({
      "META-INF/container.xml": NESTED_CONTAINER_XML,
      "OEBPS/content.opf": encodedHrefOpf("3.0", "%2E%2E/outside.xhtml"),
      "outside.xhtml": CHAPTER_XHTML,
      "OEBPS/toc.ncx": ENCODED_HREF_NCX,
      "OEBPS/nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    assert.match(await epub.readItemContents("chapter", "utf-8"), /Chapter One/)
    assert.strictEqual(
      await epub.resolveHref("%2E%2E/outside.xhtml"),
      "../outside.xhtml",
    )
  })

  it("hands back an href that leaves the publication unchanged", async () => {
    const data = await buildZip({
      "META-INF/container.xml": NESTED_CONTAINER_XML,
      "OEBPS/content.opf": encodedHrefOpf("3.0"),
      [`OEBPS/${ENCODED_CHAPTER_NAME}`]: CHAPTER_XHTML,
      "OEBPS/toc.ncx": ENCODED_HREF_NCX,
      "OEBPS/nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    for (const href of [
      "https://example.com/a b.xhtml",
      "mailto:someone@example.com",
    ]) {
      assert.strictEqual(await epub.resolveHref(href), href)
    }
  })

  it("clamps a climb above the container root instead of escaping it", async () => {
    const data = await buildZip({
      "META-INF/container.xml": NESTED_CONTAINER_XML,
      "OEBPS/content.opf": encodedHrefOpf("3.0", "../../../outside.xhtml"),
      "outside.xhtml": CHAPTER_XHTML,
      "OEBPS/toc.ncx": ENCODED_HREF_NCX,
      "OEBPS/nav.xhtml": ENCODED_HREF_NAV,
    })

    using epub = await Epub.using(MemoryAdapter).from(data)
    assert.match(await epub.readItemContents("chapter", "utf-8"), /Chapter One/)
    assert.strictEqual(
      await epub.resolveHref("../../../outside.xhtml", undefined, {
        toRoot: true,
      }),
      "outside.xhtml",
    )
  })
})

describe("failed upgrades", () => {
  it("does not leave extracted temp directories behind", async () => {
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
