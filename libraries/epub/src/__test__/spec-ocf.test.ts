/**
 * EPUB 3.3 conformance: OCF (Open Container Format).
 *
 * Section references are to https://www.w3.org/TR/epub-33/
 */

import { describe, expect, it } from "vitest"

import { Epub, MemoryAdapter } from "../index.tsx"
import { parse } from "../xml.ts"

import {
  DC_NS,
  MIMETYPE,
  OPF_NS,
  buildZip,
  createPublication,
  packageXml,
  readZipEntries,
  tryBuild,
} from "./spec-support.ts"

describe("4.3.3 OCF ZIP container media type identification", () => {
  it("includes the mimetype file as the first file in the container", async () => {
    const { buffer } = await createPublication()
    const entries = await readZipEntries(buffer)

    // "EPUB creators MUST include the mimetype file as the first file in the
    // OCF ZIP container."
    expect(entries[0]!.filename).toBe("mimetype")
  })

  it("writes the mimetype string with no padding, padding or BOM", async () => {
    const { buffer } = await createPublication()
    const [mimetype] = (await readZipEntries(buffer)).filter(
      (entry) => entry.filename === "mimetype",
    )

    if (!mimetype) throw new Error("no mimetype entry")

    // "The contents of the mimetype file MUST be the MIME media type string
    // application/epub+zip encoded in US-ASCII."
    expect(mimetype.text).toBe(MIMETYPE)
    // "MUST NOT contain any leading or trailing padding or whitespace."
    expect(mimetype.text).toBe(mimetype.text.trim())
    // "MUST NOT begin with the Unicode byte order mark U+FEFF."
    expect(mimetype.text.charCodeAt(0)).not.toBe(0xfeff)
  })

  it("does not compress the mimetype file", async () => {
    const { buffer } = await createPublication()
    const [mimetype] = (await readZipEntries(buffer)).filter(
      (entry) => entry.filename === "mimetype",
    )

    if (!mimetype) throw new Error("no mimetype entry")

    // "EPUB creators MUST NOT compress or encrypt the mimetype file."
    expect(mimetype.compressionMethod).toBe(0) // 0 = stored
  })
})

describe("4.3.2 ZIP file requirements", () => {
  it("uses only stored and deflate compression methods", async () => {
    const { buffer } = await createPublication()
    const entries = await readZipEntries(buffer)

    // "MUST include only stored (uncompressed) and Deflate-compressed ZIP
    // entries within the ZIP archive."
    const disallowed = entries
      .filter((entry) => entry.compressionMethod !== 0)
      .filter((entry) => entry.compressionMethod !== 8)
      .map((entry) => `${entry.filename} method ${entry.compressionMethod}`)

    expect(disallowed).toEqual([])
  })

  it("does not list the mimetype file in the package document", async () => {
    const { buffer } = await createPublication()
    const opf = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith(".opf"),
    )

    if (!opf) throw new Error("no package document")

    // The mimetype file is not a publication resource, so it must not appear
    // in the manifest.
    expect(opf.text).not.toContain("mimetype")
  })
})

describe("4.2.6.3.1.3 The rootfile element", () => {
  it("points at a package document with the required media type", async () => {
    const { buffer } = await createPublication()
    const entries = await readZipEntries(buffer)

    const container = entries.find(
      (entry) => entry.filename === "META-INF/container.xml",
    )
    if (!container) throw new Error("no META-INF/container.xml")

    const root = parse(container.text, "text/xml").documentElement!
    const rootfiles = Array.from(root.getElementsByTagName("rootfile"))

    expect(rootfiles.length).toBeGreaterThanOrEqual(1)

    for (const rootfile of rootfiles) {
      const fullPath = rootfile.getAttribute("full-path") ?? ""
      const mediaType = rootfile.getAttribute("media-type")

      // "The value of the attribute MUST be a path-relative-scheme-less-URL
      // string. The path is relative to the root directory."
      expect(fullPath).toBeTruthy()
      expect(fullPath.startsWith("/")).toBe(false)
      expect(fullPath).not.toMatch(/[?#]/)
      expect(fullPath).not.toMatch(/(^|\/)\.\.?(\/|$)/)

      // "The value of the attribute MUST be application/oebps-package+xml."
      expect(mediaType).toBe("application/oebps-package+xml")

      // The referenced package document has to exist.
      expect(entries.map((entry) => entry.filename)).toContain(fullPath)
    }
  })

  it("stores the container file in META-INF/container.xml", async () => {
    const { buffer } = await createPublication()
    const names = (await readZipEntries(buffer)).map((entry) => entry.filename)

    expect(names).toContain("META-INF/container.xml")
  })
})

describe("4.2.1 file names", () => {
  it("writes resource hrefs under the directory the caller chose", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "a", href: "res/one.css", mediaType: "text/css" },
        "body {}",
        "utf-8",
      )
    })

    const names = (await readZipEntries(buffer)).map((entry) => entry.filename)
    expect(names).toContain("OEBPS/res/one.css")
  })

  // 4.2.1: "All file names within the same directory MUST be unique following
  // Unicode canonical normalization and then full case folding."

  const foldedCollisions = (names: string[]): string[] => {
    const counts = new Map<string, number>()
    for (const name of names) {
      const key = name.normalize("NFKC").toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  }

  it("does not write names that collide after case folding", async () => {
    const buffer = await tryBuild(async (epub) => {
      await epub.addManifestItem(
        { id: "lower", href: "res/chapter.xhtml", mediaType: "text/css" },
        "a {}",
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "upper", href: "res/CHAPTER.xhtml", mediaType: "text/css" },
        "b {}",
        "utf-8",
      )
    })

    // Refusing the second addManifestItem is a conformant outcome.
    const names = buffer
      ? (await readZipEntries(buffer)).map((entry) => entry.filename)
      : []
    expect(foldedCollisions(names)).toEqual([])
  })

  it("does not write names that collide after Unicode normalization", async () => {
    // "ﬁ.xhtml" and "fi.xhtml" are different byte sequences but the same name
    // once NFKC folding is applied, so they overwrite each other on any
    // filesystem that normalizes.
    const buffer = await tryBuild(async (epub) => {
      await epub.addManifestItem(
        { id: "ligature", href: "res/ﬁ.xhtml", mediaType: "text/css" },
        "a {}",
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "plain", href: "res/fi.xhtml", mediaType: "text/css" },
        "b {}",
        "utf-8",
      )
    })

    const names = buffer
      ? (await readZipEntries(buffer)).map((entry) => entry.filename)
      : []
    expect(foldedCollisions(names)).toEqual([])
  })

  it("does not put spaces in generated file names", async () => {
    const { buffer } = await createPublication()
    const names = (await readZipEntries(buffer)).map((entry) => entry.filename)

    // "For compatibility with older reading systems, file names SHOULD NOT
    // contain SPACE (U+0020) characters."
    expect(names.filter((name) => name.includes(" "))).toEqual([])
  })
})

describe("4.2 container reading", () => {
  it("follows a rootfile that lives in a subdirectory", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="Content/Book.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "Content/Book.opf": packageXml({
        metadata: `    <dc:identifier id="pub-id">urn:uuid:1</dc:identifier>
    <dc:title>Subdirectory Book</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>`,
      }),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect(await epub.getTitle()).toBe("Subdirectory Book")
    expect(await epub.getVersion()).toBe("3.0")
  })

  it("reads a package document whose root element carries the opf: prefix", async () => {
    // The OPF namespace is what identifies the elements; `package` and
    // `opf:package` are the same element. This is the shape produced by many
    // in-the-wild tools.
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        prefixed: true,
        metadata: `    <dc:identifier id="pub-id">urn:uuid:2</dc:identifier>
    <dc:title>Prefixed Book</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>`,
        manifest:
          '    <opf:item href="c1.xhtml" id="c1" media-type="application/xhtml+xml"/>',
        spine: '    <opf:itemref idref="c1"/>',
      }),
      "c1.xhtml": `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>C1</title></head><body><h1>C1</h1></body></html>`,
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect(await epub.getTitle()).toBe("Prefixed Book")
    expect((await epub.getSpineItems()).map((item) => item.id)).toEqual(["c1"])
  })

  it("reads a package document that uses the default OPF namespace", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="${OPF_NS}" xmlns:dc="${DC_NS}" version="3.0" unique-identifier="pub-id">
  <metadata>
    <dc:identifier id="pub-id">urn:uuid:3</dc:identifier>
    <dc:title>Default Namespace Book</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item href="c1.xhtml" id="c1" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>
`,
      "c1.xhtml": `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>C1</title></head><body><h1>C1</h1></body></html>`,
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect(await epub.getTitle()).toBe("Default Namespace Book")
    expect((await epub.getSpineItems()).map((item) => item.id)).toEqual(["c1"])
  })
})
