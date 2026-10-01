/**
 * EPUB 3.3 conformance: content documents, resource fallbacks, vocabulary
 * prefixes, layout control and the legacy guide.
 *
 * Section references are to https://www.w3.org/TR/epub-33/
 */

import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { Epub, MemoryAdapter } from "../index.tsx"
import { parse, x } from "../xml.ts"

import {
  REQUIRED_METADATA,
  XHTML_NS,
  buildZip,
  chapterDocument,
  createPublication,
  packageXml,
  readZipEntries,
} from "./spec-support.ts"

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

async function fromOpf(
  manifest: string,
  spine: string,
  files: Record<string, string> = {},
) {
  const epubBuffer = await buildZip({
    "META-INF/container.xml": CONTAINER_XML,
    "content.opf": packageXml({ metadata: REQUIRED_METADATA, manifest, spine }),
    ...files,
  })
  return Epub.using(MemoryAdapter).from(epubBuffer)
}

describe("6.1.2 XHTML content document requirements", () => {
  it("creates XHTML documents that conform to XML syntax", async () => {
    const { buffer } = await createPublication()
    const nav = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith("nav.xhtml"),
    )!

    const problems: string[] = []
    parse(nav.text, "application/xhtml+xml", (diagnostic) => {
      problems.push(`${diagnostic.level}: ${diagnostic.message}`)
    })

    // "An XHTML content document MUST be an html document that conforms to the
    // XML syntax."
    expect(problems).toEqual([])
  })

  it("creates XHTML documents bound to the XHTML namespace", async () => {
    const { buffer } = await createPublication()
    const nav = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith("nav.xhtml"),
    )!

    const root = parse(nav.text, "application/xhtml+xml").documentElement!
    expect(root.localName).toBe("html")
    expect(root.namespaceURI).toBe(XHTML_NS)
  })

  it("does not put epub:type on the head element or metadata content", async () => {
    const { buffer } = await createPublication()
    const nav = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith("nav.xhtml"),
    )!

    const doc = parse(nav.text, "application/xhtml+xml")
    const head = doc.getElementsByTagName("head")[0]

    // 6.1.3.1: "The attribute MUST NOT be used on the head element or metadata
    // content."
    expect(head).toBeDefined()
    expect(head?.getAttribute("epub:type")).toBeNull()
    expect(
      Array.from(head?.children ?? []).some(
        (child) => child.getAttribute("epub:type") !== null,
      ),
    ).toBe(false)
  })

  it("writes void and self-closing elements so the output stays XML-valid", async () => {
    const { buffer } = await createPublication(async (epub) => {
      const doc = await epub.createXhtmlDocument(
        [
          x(
            "p",
            null,
            "A break",
            x("br"),
            " and an image",
            x("img", { src: "i.png", alt: "I" }),
          ),
        ],
        [x("title", null, "Void")],
      )
      await epub.addManifestItem(
        { id: "void", href: "void.xhtml", mediaType: "application/xhtml+xml" },
        doc,
        "xml",
      )
    })

    const voidDoc = (await readZipEntries(buffer)).find(
      (entry) => entry.filename === "OEBPS/void.xhtml",
    )
    if (!voidDoc) throw new Error("void.xhtml was not written")

    const problems: string[] = []
    parse(voidDoc.text, "application/xhtml+xml", (diagnostic) => {
      problems.push(`${diagnostic.level}: ${diagnostic.message}`)
    })
    expect(problems).toEqual([])
    // HTML void elements must not be left unclosed in XML syntax.
    expect(voidDoc.text).not.toMatch(/<br>/)
  })
})

describe("3.5 resource fallbacks", () => {
  it("resolves a manifest fallback chain across several links", async () => {
    using epub = await fromOpf(
      `    <item href="doc.xhtml" id="doc" media-type="application/xhtml+xml"/>
    <item href="doc.xhtmlz" id="doc-z" media-type="application/xhtml+xml" fallback="doc"/>`,
      `    <itemref idref="doc"/>`,
      { "doc.xhtml": chapterDocument("Chained") },
    )

    const manifest = await epub.getManifest()
    expect(manifest["doc-z"]?.fallback).toBe("doc")
  })

  it("does not hang on a circular fallback chain", async () => {
    using epub = await fromOpf(
      `    <item href="a.xhtml" id="a" media-type="application/xhtml+xml" fallback="b"/>
    <item href="b.xhtml" id="b" media-type="application/xhtml+xml" fallback="a"/>`,
      `    <itemref idref="a"/>`,
      { "a.xhtml": chapterDocument("A"), "b.xhtml": chapterDocument("B") },
    )

    // "Fallback chains MUST NOT contain circularity." Reading such a chain must
    // not loop forever; this test fails if it exceeds its timeout.
    const manifest = await epub.getManifest()
    expect(Object.keys(manifest).sort()).toEqual(["a", "b"])

    const spine = await epub.getSpineItems()
    expect(spine.map((item) => item.id)).toEqual(["a"])
  }, 5000)

  it("survives an idref to a missing fallback target", async () => {
    using epub = await fromOpf(
      `    <item href="a.xhtml" id="a" media-type="application/xhtml+xml" fallback="nope"/>`,
      `    <itemref idref="a"/>`,
      { "a.xhtml": chapterDocument("A") },
    )

    const manifest = await epub.getManifest()
    expect(manifest["a"]?.fallback).toBe("nope")
    expect(await epub.getSpineItems()).toHaveLength(1)
  })
})

describe("5.4 / D.1.4 the prefix attribute", () => {
  it("writes a prefix attribute that can be read back", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setPackageVocabularyPrefix(
        "foaf",
        "http://xmlns.com/foaf/0.1/",
      )
    })

    const opf = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith(".opf"),
    )!
    const root = parse(opf.text, "text/xml").documentElement!

    // "The prefix attribute provides a declaration mechanism for prefixes not
    // reserved by this specification." The syntax is a space-separated list of
    // `prefix: uri` pairs.
    const prefix = root.getAttribute("prefix")
    expect(prefix).toBeTruthy()
    expect(prefix).toContain("foaf:")
    expect(prefix).toContain("http://xmlns.com/foaf/0.1/")
  })

  it("keeps the package document XML-conformant after setting prefixes", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setPackageVocabularyPrefix(
        "foaf",
        "http://xmlns.com/foaf/0.1/",
      )
      await epub.setPackageVocabularyPrefix("bc", "http://purl.org/docbook/")
    })

    const opf = (await readZipEntries(buffer)).find((entry) =>
      entry.filename.endsWith(".opf"),
    )!

    const problems: string[] = []
    parse(opf.text, "text/xml", (diagnostic) => {
      problems.push(`${diagnostic.level}: ${diagnostic.message}`)
    })
    expect(problems).toEqual([])
  })

  it("round-trips prefix declarations through a saved publication", async () => {
    // setPackageVocabularyPrefix joins multiple declarations with "\n    ", so
    // the reader has to cope with newlines inside the attribute value.
    const { path } = await createPublication(async (epub) => {
      await epub.setPackageVocabularyPrefix(
        "foaf",
        "http://xmlns.com/foaf/0.1/",
      )
      await epub.setPackageVocabularyPrefix("bc", "http://purl.org/docbook/")
    })

    using epub = await Epub.using(MemoryAdapter).from(await readFile(path))

    const prefixes = await epub.getPackageVocabularyPrefixes()
    expect(prefixes["foaf"]).toBe("http://xmlns.com/foaf/0.1/")
    expect(prefixes["bc"]).toBe("http://purl.org/docbook/")
  })

  it("reads prefix declarations written on a single line", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": packageXml({
        packageAttributes:
          'prefix="foaf: http://xmlns.com/foaf/0.1/ bc: http://purl.org/docbook/"',
        metadata: REQUIRED_METADATA,
      }),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    const prefixes = await epub.getPackageVocabularyPrefixes()
    expect(prefixes["foaf"]).toBe("http://xmlns.com/foaf/0.1/")
    expect(prefixes["bc"]).toBe("http://purl.org/docbook/")
  })
})

describe("8.2 layout rendering control", () => {
  it("defaults to reflowable when no layout property is present", async () => {
    using epub = await fromOpf(
      `    <item href="page.xhtml" id="p" media-type="application/xhtml+xml"/>`,
      `    <itemref idref="p"/>`,
    )

    // 8.3: a publication with no rendition:layout is reflowable.
    expect(await epub.getLayout()).toBe("reflowable")
  })

  it("reads rendition:layout from metadata", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": packageXml({
        metadata: `    ${REQUIRED_METADATA}
    <meta property="rendition:layout">pre-paginated</meta>`,
        manifest:
          '    <item href="page.xhtml" id="p" media-type="application/xhtml+xml"/>',
        spine: '    <itemref idref="p"/>',
      }),
      "page.xhtml": chapterDocument("Page"),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect(await epub.getLayout()).toBe("pre-paginated")
  })
})

describe("5.9 legacy guide", () => {
  it("reads guide reference elements", async () => {
    // The package content model puts guide after spine, so the document is
    // hand-authored rather than built with the packageXml helper.
    const epubBuffer = await buildZip({
      "META-INF/container.xml": CONTAINER_XML,
      "content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0" unique-identifier="pub-id">
  <metadata>
${REQUIRED_METADATA}
  </metadata>
  <manifest>
    <item href="text.xhtml" id="t" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="t"/>
  </spine>
  <guide>
    <reference type="text" title="Body Matter" href="text.xhtml"/>
    <reference type="toc" title="Contents" href="text.xhtml#toc"/>
  </guide>
</package>
`,
      "text.xhtml": chapterDocument("Text"),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    const entries = await epub.getGuideEntries()
    expect(entries.map((entry) => entry.type)).toEqual(["text", "toc"])
    expect(entries[0]?.title).toBe("Body Matter")
    expect(entries[1]?.href).toBe("text.xhtml#toc")
  })
})
