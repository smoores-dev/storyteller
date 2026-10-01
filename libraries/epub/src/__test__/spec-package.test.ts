/**
 * EPUB 3.3 conformance: the package document itself.
 *
 * Assertions inspect the bytes that were written, rather than what the
 * library's own readers report, so a reader bug cannot mask a writer bug.
 *
 * Section references are to https://www.w3.org/TR/epub-33/
 */

import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { Epub, MemoryAdapter } from "../index.tsx"
import { parse } from "../xml.ts"

import {
  OPF_NS,
  buildZip,
  createPublication,
  packageXml,
  readZipEntries,
} from "./spec-support.ts"

async function opfDocument(buffer: Buffer) {
  const entries = await readZipEntries(buffer)
  const opf = entries.find((entry) => entry.filename.endsWith(".opf"))
  if (!opf) throw new Error("no package document in the archive")
  return parse(opf.text, "text/xml")
}

describe("5.4 The package element", () => {
  it("uses package as the root element with version 3.0", async () => {
    const { buffer } = await createPublication()
    const doc = await opfDocument(buffer)

    // "package … REQUIRED root element of the package document."
    expect(doc.documentElement?.localName).toBe("package")

    // "The version attribute … MUST have the value "3.0" to indicate
    // conformance with EPUB 3."
    expect(doc.documentElement?.getAttribute("version")).toBe("3.0")
  })

  it("declares the package element in the OPF namespace", async () => {
    const { buffer } = await createPublication()
    const doc = await opfDocument(buffer)

    // Namespace names are not required to be declared, but a document with no
    // namespace at all is not an OPF document, and this library writes one.
    expect(doc.documentElement?.namespaceURI).toBe(OPF_NS)
  })

  it("declares unique-identifier and resolves it to a dc:identifier", async () => {
    const { buffer } = await createPublication()
    const doc = await opfDocument(buffer)
    const root = doc.documentElement!

    // "unique-identifier [required] … takes an IDREF that identifies the
    // dc:identifier element that provides the preferred, or primary,
    // identifier."
    const uid = root.getAttribute("unique-identifier")
    expect(uid).toBeTruthy()

    const metadata = Array.from(root.children).find(
      (child) => child.localName === "metadata",
    )
    if (!metadata) throw new Error("no metadata element")

    const targets = Array.from(metadata.children).filter(
      (child) =>
        child.localName === "identifier" && child.getAttribute("id") === uid,
    )
    expect(targets.length).toBe(1)
  })

  it("has metadata, manifest and spine exactly once, in that order", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setTitle("Another title")
      await epub.setTitle("And another")
      await epub.addSubject("Spec")
      await epub.addCollection({ name: "Series", type: "series" })
    })
    const doc = await opfDocument(buffer)
    const root = doc.documentElement!

    // Content model, in order: metadata [exactly 1], manifest [exactly 1],
    // spine [exactly 1].
    const structure = Array.from(root.children)
      .map((child) => child.localName)
      .filter(
        (name) =>
          name === "metadata" || name === "manifest" || name === "spine",
      )

    expect(structure).toEqual(["metadata", "manifest", "spine"])
  })

  it("keeps exactly one spine and manifest across item edits", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        {
          id: "extra",
          href: "extra.xhtml",
          mediaType: "application/xhtml+xml",
        },
        "<html/>",
        "utf-8",
      )
      await epub.addSpineItem("extra")
      await epub.removeSpineItem(0)
      await epub.removeManifestItem("extra")
    })
    const doc = await opfDocument(buffer)
    const names = Array.from(doc.documentElement!.children).map(
      (child) => child.localName,
    )

    expect(names.filter((name) => name === "manifest").length).toBe(1)
    expect(names.filter((name) => name === "spine").length).toBe(1)
  })
})

describe("3.9 XML conformance", () => {
  it("writes a package document that parses without XML errors", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setDescription(
        "A description with & ampersand, < angle, and é accents",
      )
      await epub.addCreator({ name: "_creator & <co>" })
    })
    const entries = await readZipEntries(buffer)
    const opf = entries.find((entry) => entry.filename.endsWith(".opf"))!

    const problems: string[] = []
    parse(opf.text, "text/xml", (diagnostic) => {
      problems.push(`${diagnostic.level}: ${diagnostic.message}`)
    })

    // "MUST be a conformant XML 1.0 Document."
    expect(problems).toEqual([])
  })

  it("writes no document type declaration in the package document", async () => {
    const { buffer } = await createPublication()
    const opf = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith(".opf"),
    )!

    // "MAY only specify a document type declaration that references an external
    // identifier appropriate for its media type … or that omits external
    // identifiers." An OPF document has no appropriate external identifier, so
    // the only conforming options are none at all.
    expect(opf.text.toLowerCase()).not.toContain("<!doctype")
    expect(opf.text).not.toContain("<!ENTITY")
  })

  it("round-trips non-ASCII text in UTF-8", async () => {
    const title = "Оно — «It» © 1986 ‹ﬁ› 😀"
    const { path } = await createPublication(async (epub) => {
      await epub.setTitle(title)
    })

    const reread = await Epub.using(MemoryAdapter).from(await readFile(path))
    expect(await reread.getTitle()).toBe(title)
  })
})

describe("5.4 package document reading", () => {
  it("honours a unique-identifier that names a non-default id", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        uniqueIdentifierId: "book-uid",
        metadata: `    <dc:identifier id="other-id">urn:uuid:first</dc:identifier>
    <dc:identifier id="book-uid">urn:uuid:selected</dc:identifier>
    <dc:title>Two Identifiers</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>`,
      }),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect(await epub.getUniqueIdentifierId()).toBe("book-uid")
    expect(await epub.getUniqueIdentifier()).toBe("urn:uuid:selected")
  })

  it("reads dir and xml:lang from the package element", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        packageAttributes: 'dir="rtl" xml:lang="ar"',
        metadata: `    <dc:identifier id="pub-id">urn:uuid:rtl</dc:identifier>
    <dc:title>RTL Book</dc:title>
    <dc:language>ar</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>`,
      }),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect(await epub.getBaseDirection()).toBe("rtl")
  })
})
