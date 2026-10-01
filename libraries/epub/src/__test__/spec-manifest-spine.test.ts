import type { Element } from "@xmldom/xmldom"
/**
 * EPUB 3.3 conformance: manifest and spine.
 *
 * Section references are to https://www.w3.org/TR/epub-33/
 */
import { describe, expect, it } from "vitest"

import { Epub, MemoryAdapter, TmpFsAdapter } from "../index.tsx"
import { parse } from "../xml.ts"

import {
  REQUIRED_METADATA,
  buildZip,
  chapterDocument,
  createPublication,
  navDocument,
  packageXml,
  readZipEntries,
  tempPath,
  tryBuild,
} from "./spec-support.ts"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

type OpfParts = {
  root: Element
  manifest: Element
  spine: Element
  items: Element[]
  itemrefs: Element[]
  entries: { filename: string; text: string }[]
}

async function opfParts(buffer: Buffer): Promise<OpfParts> {
  const entries = await readZipEntries(buffer)
  const opf = entries.find((entry) => entry.filename.endsWith(".opf"))
  if (!opf) throw new Error("no package document in the archive")

  const root = parse(opf.text, "text/xml").documentElement!
  const manifest = Array.from(root.children).find(
    (child) => child.localName === "manifest",
  )
  const spine = Array.from(root.children).find(
    (child) => child.localName === "spine",
  )
  if (!manifest || !spine) throw new Error("no manifest or spine element")

  return {
    root,
    manifest,
    spine,
    items: Array.from(manifest.children),
    itemrefs: Array.from(spine.children),
    entries,
  }
}

describe("5.6.1 The manifest element", () => {
  it("lists every publication resource", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "style", href: "css/style.css", mediaType: "text/css" },
        "body { color: black }",
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "logo", href: "img/logo.png", mediaType: "image/png" },
        new Uint8Array(PNG),
      )
    })
    const { entries, items } = await opfParts(buffer)

    const packaged = entries
      .map((entry) => entry.filename)
      // The mimetype file is not a publication resource and the container is
      // not listed either; both live outside the manifest's remit.
      .filter((name) => name !== "mimetype")
      .filter((name) => name !== "META-INF/container.xml")
      .filter((name) => !name.endsWith(".opf"))

    const listed = new Set(items.map((item) => item.getAttribute("href")))

    // Item hrefs are relative to the package document, so strip its directory.
    const base = entries.find((entry) =>
      entry.filename.endsWith(".opf"),
    )!.filename
    const dir = base.includes("/")
      ? base.slice(0, base.lastIndexOf("/") + 1)
      : ""

    const missing = packaged.filter((name) => {
      const relative = name.startsWith(dir) ? name.slice(dir.length) : name
      return !listed.has(relative)
    })

    // "The manifest MUST list all publication resources regardless of whether
    // they are essential to the rendering of the publication."
    expect(missing).toEqual([])
  })

  it("does not specify an item for the package document itself", async () => {
    const { buffer } = await createPublication()
    const { items } = await opfParts(buffer)

    // "The manifest MUST NOT specify an item element for it."
    const opfItems = items.filter((item) =>
      (item.getAttribute("href") ?? "").endsWith(".opf"),
    )
    expect(opfItems).toEqual([])
  })
})

describe("5.6.2 The item element", () => {
  it("gives every item an id, an href and a media type", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "style", href: "style.css", mediaType: "text/css" },
        "body {}",
        "utf-8",
      )
    })
    const { items } = await opfParts(buffer)

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.getAttribute("id")).toBeTruthy()
      expect(item.getAttribute("href")).toBeTruthy()
      // "media-type [required]"
      expect(item.getAttribute("media-type")).toBeTruthy()
    }
  })

  it("writes one item per addManifestItem call, in order", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "a", href: "a.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("A"),
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "b", href: "b.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("B"),
        "utf-8",
      )
    })
    const { items } = await opfParts(buffer)

    expect(items.map((item) => item.getAttribute("id"))).toEqual([
      "nav",
      "chapter1",
      "a",
      "b",
    ])
  })

  it("does not write two manifest items sharing an id", async () => {
    // 5.6.2: item ids are XML IDs, so they have to be unique within the
    // package document. addManifestItem with an existing id currently writes a
    // second <item> with the same id, which also makes the id useless as a
    // lookup key.
    const buffer = await tryBuild(async (epub) => {
      await epub.addManifestItem(
        { id: "dup", href: "a.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("A"),
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "dup", href: "b.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("B"),
        "utf-8",
      )
    })

    const ids = buffer
      ? (await opfParts(buffer)).items.map((item) => item.getAttribute("id"))
      : []
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it("does not write two manifest items sharing an href", async () => {
    // 5.6.2: "EPUB creators MUST ensure each URL is unique within the context
    // of the manifest."
    const buffer = await tryBuild(async (epub) => {
      await epub.addManifestItem(
        { id: "one", href: "same.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("One"),
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "two", href: "same.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("Two"),
        "utf-8",
      )
    })

    const hrefs = buffer
      ? (await opfParts(buffer)).items.map((item) => item.getAttribute("href"))
      : []
    expect(hrefs.filter((href, i) => hrefs.indexOf(href) !== i)).toEqual([])
  })

  it("declares exactly one item as the navigation document", async () => {
    const { buffer } = await createPublication()
    const { items } = await opfParts(buffer)

    // "EPUB creators MUST declare exactly one item as the EPUB navigation
    // document."
    const navItems = items.filter((item) =>
      (item.getAttribute("properties") ?? "").split(/\s+/).includes("nav"),
    )
    expect(navItems).toHaveLength(1)
    expect(navItems[0]?.getAttribute("media-type")).toBe(
      "application/xhtml+xml",
    )
  })

  it("declares at most one cover image", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setCoverImage("img/cover.png", new Uint8Array(PNG))
      await epub.setCoverImage("img/cover2.png", new Uint8Array(PNG))
    })
    const { items } = await opfParts(buffer)

    const covers = items.filter((item) =>
      (item.getAttribute("properties") ?? "")
        .split(/\s+/)
        .includes("cover-image"),
    )
    expect(covers.length).toBeLessThanOrEqual(1)
  })
})

describe("5.7 spine", () => {
  it("specifies at least one content document", async () => {
    const { buffer } = await createPublication()
    const { spine } = await opfParts(buffer)

    // "The spine MUST specify at least one EPUB content document or foreign
    // content document."
    const itemrefs = Array.from(spine.children).filter(
      (child) => child.localName === "itemref",
    )
    expect(itemrefs.length).toBeGreaterThanOrEqual(1)
  })

  it("resolves every itemref idref to a manifest item", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "c2", href: "c2.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("Two"),
        "utf-8",
      )
      await epub.addSpineItem("c2")
    })
    const { items, itemrefs } = await opfParts(buffer)

    const ids = new Set(items.map((item) => item.getAttribute("id")))
    const dangling = itemrefs
      .map((itemref) => itemref.getAttribute("idref"))
      .filter((idref) => !ids.has(idref))

    // "Each itemref element MUST reference the ID of an item in the manifest
    // via the IDREF in its idref attribute."
    expect(dangling).toEqual([])
  })

  it("does not reference one manifest item more than once", async () => {
    // 5.7.2: "item element IDs MUST NOT be referenced more than once." Calling
    // addSpineItem twice with the same id currently appends a second itemref.
    const buffer = await tryBuild(async (epub) => {
      await epub.addSpineItem("chapter1")
    })

    const idrefs = buffer
      ? (await opfParts(buffer)).itemrefs.map((ref) =>
          ref.getAttribute("idref"),
        )
      : []
    expect(idrefs.filter((id, i) => idrefs.indexOf(id) !== i)).toEqual([])
  })

  it("does not put an item that is not a content document in the spine", async () => {
    // 5.7.2: "Each referenced manifest item MUST be either a) an EPUB content
    // document or b) a foreign content document that includes an EPUB content
    // document in its manifest fallback chain." A stylesheet is neither.
    const buffer = await tryBuild(async (epub) => {
      await epub.addManifestItem(
        { id: "style", href: "style.css", mediaType: "text/css" },
        "body {}",
        "utf-8",
      )
      await epub.addSpineItem("style")
    })

    let nonContent: string[] = []
    if (buffer) {
      const { items, itemrefs } = await opfParts(buffer)
      const mediaTypeById = new Map(
        items.map((item) => [
          item.getAttribute("id"),
          item.getAttribute("media-type") ?? "",
        ]),
      )
      nonContent = itemrefs
        .map((ref) => ref.getAttribute("idref") ?? "")
        .filter((id) => {
          // A dangling idref is a separate violation with its own test.
          const mediaType = mediaTypeById.get(id)
          if (mediaType === undefined) return false
          // XHTML and SVG are the EPUB content document media types.
          return (
            mediaType !== "application/xhtml+xml" &&
            mediaType !== "image/svg+xml"
          )
        })
    }
    expect(nonContent).toEqual([])
  })

  it("removes the spine reference along with a manifest item", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "temp", href: "temp.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("Temp"),
        "utf-8",
      )
      await epub.addSpineItem("temp")
      await epub.removeManifestItem("temp")
    })
    const { items, itemrefs } = await opfParts(buffer)

    const ids = new Set(items.map((item) => item.getAttribute("id")))
    const dangling = itemrefs
      .map((itemref) => itemref.getAttribute("idref"))
      .filter((idref) => !ids.has(idref))

    // A leftover idref is a dangling XML IDREF, which makes the package
    // document non-conformant.
    expect(dangling).toEqual([])
  })

  it("preserves spine order when items are inserted at an index", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "b", href: "b.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("B"),
        "utf-8",
      )
      await epub.addManifestItem(
        { id: "c", href: "c.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("C"),
        "utf-8",
      )
      await epub.addSpineItem("b")
      await epub.addSpineItem("c")
    })
    const { itemrefs } = await opfParts(buffer)

    const order = itemrefs.map((itemref) => itemref.getAttribute("idref"))
    expect(order).toEqual(["chapter1", "b", "c"])
  })

  it("allows a foreign content document whose fallback chain reaches a content document", async () => {
    // 5.7.2 permits a foreign content document "that includes an EPUB content
    // document in its manifest fallback chain", so this must not be rejected.
    const { buffer } = await createPublication(async (epub) => {
      await epub.addManifestItem(
        { id: "aux", href: "aux.xhtml", mediaType: "application/xhtml+xml" },
        chapterDocument("Aux"),
        "utf-8",
      )
      await epub.addManifestItem(
        {
          id: "foreign",
          href: "book.fab",
          mediaType: "application/x-future",
          fallback: "aux",
        },
        "future",
        "utf-8",
      )
      await epub.addSpineItem("foreign")
    })

    const { itemrefs } = await opfParts(buffer)
    expect(itemrefs.map((ref) => ref.getAttribute("idref"))).toContain(
      "foreign",
    )
  })

  it("terminates when the manifest fallback chain cycles", async () => {
    // Neither item is a content document, so the walk has to exhaust the cycle
    // and reject rather than loop forever.
    const path = await tempPath("fallback-cycle.epub")
    using epub = await Epub.using(TmpFsAdapter).create(path, {
      title: "Conformance Test",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:5b0e1a1a-8f0e-4f2a-9c1d-2d5e6a7b8c9e",
    })

    await epub.addManifestItem(
      {
        id: "a",
        href: "a.bin",
        mediaType: "application/octet-stream",
        fallback: "b",
      },
      "a",
      "utf-8",
    )
    await epub.addManifestItem(
      {
        id: "b",
        href: "b.bin",
        mediaType: "application/octet-stream",
        fallback: "a",
      },
      "b",
      "utf-8",
    )

    await expect(epub.addSpineItem("a")).rejects.toThrow(/content document/)
  })

  it("allows a spine item to be re-added after its manifest item is removed", async () => {
    // Removing a manifest item rewrites the spine, so a spine read made before
    // the removal must not leave a stale cached copy behind. If it did, the
    // duplicate-reference check in addSpineItem would reject the re-added item.
    const path = await tempPath("spine-cache.epub")
    using epub = await Epub.using(TmpFsAdapter).create(path, {
      title: "Conformance Test",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:7c2c3b3d-6f4a-4e5b-8d1c-9f0e1a2b3c3d",
    })

    const chapter = {
      id: "temp",
      href: "temp.xhtml",
      mediaType: "application/xhtml+xml",
    }

    await epub.addManifestItem(chapter, chapterDocument("Temp"), "utf-8")
    await epub.addSpineItem("temp")
    await epub.getSpineItems()
    await epub.removeManifestItem("temp")

    await epub.addManifestItem(chapter, chapterDocument("Temp"), "utf-8")
    await epub.addSpineItem("temp")

    const spine = await epub.getSpineItems()
    expect(spine.map((entry) => entry.id)).toEqual(["temp"])
  })
})

describe("5.6 and 5.7 reading", () => {
  it("reads a spine that lists items in an arbitrary manifest order", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        metadata: REQUIRED_METADATA,
        manifest: `    <item href="nav.xhtml" id="nav" media-type="application/xhtml+xml" properties="nav"/>
    <item href="three.xhtml" id="three" media-type="application/xhtml+xml"/>
    <item href="one.xhtml" id="one" media-type="application/xhtml+xml"/>
    <item href="two.xhtml" id="two" media-type="application/xhtml+xml"/>`,
        spine: `    <itemref idref="two"/>
    <itemref idref="one"/>
    <itemref idref="three"/>`,
      }),
      "nav.xhtml": navDocument(),
      "one.xhtml": chapterDocument("One"),
      "two.xhtml": chapterDocument("Two"),
      "three.xhtml": chapterDocument("Three"),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    expect((await epub.getSpineItems()).map((item) => item.id)).toEqual([
      "two",
      "one",
      "three",
    ])
  })

  it("reads an itemref whose linear attribute is absent as linear", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        metadata: REQUIRED_METADATA,
        manifest: `    <item href="a.xhtml" id="a" media-type="application/xhtml+xml"/>
    <item href="b.xhtml" id="b" media-type="application/xhtml+xml"/>`,
        spine: `    <itemref idref="a"/>
    <itemref idref="b" linear="no"/>`,
      }),
      "a.xhtml": chapterDocument("A"),
      "b.xhtml": chapterDocument("B"),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    // "linear [optional] … the absence of the attribute means yes."
    const spine = await epub.getSpineItems()
    expect(spine.map((item) => ({ id: item.id, linear: item.linear }))).toEqual(
      [
        { id: "a", linear: true },
        { id: "b", linear: false },
      ],
    )
  })

  it("reads a spine that references an item with a manifest fallback chain", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        metadata: REQUIRED_METADATA,
        manifest: `    <item href="doc.xhtml" id="doc" media-type="application/xhtml+xml"/>
    <item href="doc.md" id="doc-alt" media-type="text/markdown" fallback="doc"/>`,
        spine: `    <itemref idref="doc"/>
    <itemref idref="doc-alt"/>`,
      }),
      "doc.xhtml": chapterDocument("Fallback Target"),
      "doc.md": "# Fallback Target",
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    const spine = await epub.getSpineItems()
    expect(spine.map((item) => item.id)).toEqual(["doc", "doc-alt"])

    // 5.6.2: the fallback IDREF has to resolve, so it must survive the read.
    const fallbacks = spine.map((item) => item.fallback)
    expect(fallbacks[1]).toBe("doc")
  })
})
