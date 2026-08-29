import assert from "node:assert"
import { readFile, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"

import { ZipFile } from "yazl"

import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { setupTestDb } from "@/__tests__/harness/testDb"
import { createTestLibrary } from "@/__tests__/harness/testFs"
import { canonicalizePath } from "@/assets/library/scanner/folder"
import { scanLibrary } from "@/assets/library/scanner/scan"
import { isSuppressed } from "@/assets/library/scanner/write-intent"
import { getBooks } from "@/database/books"
import { createImportRule, getIgnorePaths } from "@/database/importRules"

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

function tocNcx(uid: string, title: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${uid}"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Chapter One</text></navLabel>
      <content src="chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>
`
}

function epub2Opf(opts: {
  uid: string
  title: string
  prefixed?: boolean
  extraManifestItems?: string
}): string {
  const p = opts.prefixed ? "ns0:" : ""
  const nsAttr = opts.prefixed
    ? 'xmlns:ns0="http://www.idpf.org/2007/opf"'
    : 'xmlns="http://www.idpf.org/2007/opf"'
  return `<?xml version="1.0" encoding="utf-8"?>
<${p}package ${nsAttr} xmlns:dc="http://purl.org/dc/elements/1.1/" unique-identifier="uid" version="2.0">
  <${p}metadata>
    <dc:title>${opts.title}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">${opts.uid}</dc:identifier>
  </${p}metadata>
  <${p}manifest>
    <${p}item href="chapter.xhtml" id="chapter" media-type="application/xhtml+xml" />
    <${p}item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml" />${opts.extraManifestItems ?? ""}
  </${p}manifest>
  <${p}spine toc="ncx">
    <${p}itemref idref="chapter" />
  </${p}spine>
</${p}package>
`
}

async function buildEpub2(opts: {
  uid: string
  title: string
  prefixed?: boolean
  brokenManifest?: boolean
  trailingJunk?: boolean
}): Promise<Buffer> {
  const zip = await buildZip({
    "META-INF/container.xml": CONTAINER_XML,
    "content.opf": epub2Opf({
      uid: opts.uid,
      title: opts.title,
      ...(opts.prefixed && { prefixed: true }),
      ...(opts.brokenManifest && {
        extraManifestItems: `\n    <item href="missing.xhtml" id="missing" media-type="application/xhtml+xml" />`,
      }),
    }),
    "chapter.xhtml": CHAPTER_XHTML,
    "toc.ncx": tocNcx(opts.uid, opts.title),
  })
  return opts.trailingJunk
    ? Buffer.concat([zip, Buffer.from([0x3c, 0x34])])
    : zip
}

async function epubVersionAt(path: string): Promise<string> {
  try {
    using epub = await Epub.using(MemoryAdapter).from(path)
    return await epub.getVersion()
  } catch {
    return "2.0"
  }
}

const SIGNAL = () => new AbortController().signal

void describe("epub2 import strategies", () => {
  void it("replace converts the file in place", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "replace" })
    await using library = await createTestLibrary("epub2-replace")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const source = await canonicalizePath(
      await folder.add(
        "book.epub",
        await buildEpub2({ uid: "epub2-replace", title: "Replace Book" }),
      ),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Replace Book")
    assert.strictEqual(books[0].ebook?.filepath, source)
    assert.strictEqual(await epubVersionAt(source), "3.0")
    await folder.expectFiles(["book.epub"])
  })

  void it("backup-and-convert keeps a suffixed backup and converts the original path", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "backup-and-convert" })
    await using library = await createTestLibrary("epub2-backup")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const originalBytes = await buildEpub2({
      uid: "epub2-backup",
      title: "Backup Book",
    })
    const source = await canonicalizePath(
      await folder.add("book.epub", originalBytes),
    )
    const backupPath = join(folder.path, "book_epub2.epub")

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.ebook?.filepath, source)
    assert.strictEqual(await epubVersionAt(source), "3.0")

    const backupBytes = await readFile(backupPath)
    assert.ok(
      backupBytes.equals(originalBytes),
      "backup must hold the untouched epub 2 bytes",
    )

    const ignorePaths = await getIgnorePaths()
    assert.ok(ignorePaths.includes(await canonicalizePath(backupPath)))

    await scanLibrary({ source: "manual", signal: SIGNAL() })
    assert.strictEqual((await getBooks()).length, 1)
  })

  void it("skip refuses to import epub 2 files", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "skip" })
    await using library = await createTestLibrary("epub2-skip")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const originalBytes = await buildEpub2({
      uid: "epub2-skip",
      title: "Skip Book",
    })
    const source = await folder.add("book.epub", originalBytes)

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    assert.strictEqual((await getBooks()).length, 0)
    assert.ok((await readFile(source)).equals(originalBytes))
  })

  void it("convert-alongside leaves the original untouched and imports the converted copy", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "convert-alongside" })
    await using library = await createTestLibrary("epub2-alongside")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const originalBytes = await buildEpub2({
      uid: "epub2-alongside",
      title: "Alongside Book",
    })
    const source = await canonicalizePath(
      await folder.add("book.epub", originalBytes),
    )
    const convertedPath = join(folder.path, "book_epub3.epub")

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Alongside Book")
    assert.strictEqual(
      books[0].ebook?.filepath,
      await canonicalizePath(convertedPath),
    )

    assert.ok(
      (await readFile(source)).equals(originalBytes),
      "original epub 2 must be byte-identical after import",
    )
    assert.strictEqual(await epubVersionAt(convertedPath), "3.0")

    const ignorePaths = await getIgnorePaths()
    assert.ok(ignorePaths.includes(source))

    await scanLibrary({ source: "manual", signal: SIGNAL() })
    assert.strictEqual((await getBooks()).length, 1)
    assert.ok((await readFile(source)).equals(originalBytes))
  })

  void it("renders the version placeholder in the configured suffix", async () => {
    using _db = setupTestDb({
      epub2ImportStrategy: "convert-alongside",
      epub2BackupSuffix: " (v{version})",
    })
    await using library = await createTestLibrary("epub2-suffix-template")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    await folder.add(
      "book.epub",
      await buildEpub2({ uid: "epub2-template", title: "Template Book" }),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(
      books[0]?.ebook?.filepath,
      await canonicalizePath(join(folder.path, "book (v3).epub")),
    )
    await folder.expectFiles(["book.epub", "book (v3).epub"])
  })

  void it("falls back to -epub3 for a suffix without a placeholder", async () => {
    using _db = setupTestDb({
      epub2ImportStrategy: "convert-alongside",
      epub2BackupSuffix: "_epub2",
    })
    await using library = await createTestLibrary("epub2-suffix-legacy")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    await folder.add(
      "book.epub",
      await buildEpub2({ uid: "epub2-legacy-suffix", title: "Legacy Book" }),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(
      books[0]?.ebook?.filepath,
      await canonicalizePath(join(folder.path, "book-epub3.epub")),
    )
  })

  void it("backup-and-convert rolls back when the conversion fails", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "backup-and-convert" })
    await using library = await createTestLibrary("epub2-backup-rollback")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const originalBytes = await buildEpub2({
      uid: "epub2-backup-rollback",
      title: "Broken Book",
      brokenManifest: true,
    })
    const source = await canonicalizePath(
      await folder.add("book.epub", originalBytes),
    )
    const backupPath = join(folder.path, "book_epub2.epub")

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    assert.strictEqual((await getBooks()).length, 0)
    await folder.expectFiles(["book.epub"])
    assert.ok(
      (await readFile(source)).equals(originalBytes),
      "original must be restored after a failed conversion",
    )

    const ignorePaths = await getIgnorePaths()
    assert.ok(!ignorePaths.includes(await canonicalizePath(backupPath)))

    assert.ok(
      isSuppressed(source) &&
        isSuppressed(join(dirname(source), "book_epub2.epub")),
      "the rollback writes must stay suppressed, or the watcher rescans the file and retries the failing conversion forever",
    )
  })

  void it("convert-alongside rolls back when the conversion fails", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "convert-alongside" })
    await using library = await createTestLibrary("epub2-alongside-rollback")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const originalBytes = await buildEpub2({
      uid: "epub2-alongside-rollback",
      title: "Broken Book",
      brokenManifest: true,
    })
    const source = await canonicalizePath(
      await folder.add("book.epub", originalBytes),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    assert.strictEqual((await getBooks()).length, 0)
    await folder.expectFiles(["book.epub"])
    assert.ok((await readFile(source)).equals(originalBytes))
    assert.ok(!(await getIgnorePaths()).includes(source))

    assert.ok(
      isSuppressed(source),
      "the rollback writes must stay suppressed, or the watcher rescans the file and retries the failing conversion forever",
    )
  })
})

void describe("epub2 files that used to fail to open", () => {
  void it("imports an epub 2 with trailing junk after the zip end record", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "replace" })
    await using library = await createTestLibrary("epub2-junk")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const source = await canonicalizePath(
      await folder.add(
        "book.epub",
        await buildEpub2({
          uid: "epub2-junk",
          title: "Junked Book",
          trailingJunk: true,
        }),
      ),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Junked Book")
    assert.strictEqual(await epubVersionAt(source), "3.0")
  })

  void it("imports an epub 2 whose opf uses a prefixed package namespace", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "replace" })
    await using library = await createTestLibrary("epub2-prefixed")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    const source = await canonicalizePath(
      await folder.add(
        "book.epub",
        await buildEpub2({
          uid: "epub2-prefixed",
          title: "Prefixed Book",
          prefixed: true,
        }),
      ),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Prefixed Book")
    assert.strictEqual(await epubVersionAt(source), "3.0")
  })
})

void describe("folder listing", () => {
  void it("does not race the converted file into a duplicate candidate", async () => {
    using _db = setupTestDb({ epub2ImportStrategy: "convert-alongside" })
    await using library = await createTestLibrary("epub2-alongside-dupes")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("b1")
    await folder.add(
      "book.epub",
      await buildEpub2({ uid: "epub2-dupes", title: "Dupe Check" }),
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })
    await scanLibrary({ source: "manual", signal: SIGNAL() })
    await scanLibrary({ source: "manual", signal: SIGNAL() })
    await scanLibrary({ source: "manual", signal: SIGNAL() })

    assert.strictEqual((await getBooks()).length, 1)
    const entries = await readdir(folder.path)
    assert.deepStrictEqual(entries.sort(), ["book.epub", "book_epub3.epub"])
  })
})
