/**
 * EPUB 3.3 conformance: package document metadata.
 *
 * Section references are to https://www.w3.org/TR/epub-33/
 */
import { readFile } from "node:fs/promises"

import type { Element } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import { Epub, MemoryAdapter, TmpFsAdapter } from "../index.tsx"
import { parse } from "../xml.ts"

import {
  REQUIRED_METADATA,
  buildZip,
  createPublication,
  packageXml,
  readZipEntries,
  tempPath,
} from "./spec-support.ts"

async function metadataChildren(buffer: Buffer) {
  const opf = (await readZipEntries(buffer)).find((entry) =>
    entry.filename.endsWith(".opf"),
  )
  if (!opf) throw new Error("no package document in the archive")

  const root = parse(opf.text, "text/xml").documentElement!
  const metadata = Array.from(root.children).find(
    (child) => child.localName === "metadata",
  )
  if (!metadata) throw new Error("no metadata element")

  return Array.from(metadata.children).filter((child) => {
    // Skip whitespace-only text nodes are already excluded by `children`;
    // comments would show up here, so drop them explicitly.
    return child.nodeName !== "#comment"
  })
}

function metaProperty(elements: Element[], property: string): Element[] {
  return elements.filter((element) => {
    return element.getAttribute("property") === property
  })
}

describe("5.5.3 minimal metadata requirements", () => {
  it("contains dc:title, dc:identifier and dc:language", async () => {
    const { buffer } = await createPublication()
    const children = await metadataChildren(buffer)

    // "It MUST contain the dcterms dc:title, dc:identifier, and dc:language
    // elements together with the dcterms dcterms:modified property."
    const localNames = children.map((child) => child.localName)
    for (const required of ["title", "identifier", "language"]) {
      expect(localNames).toContain(required)
    }
  })

  it("keeps exactly one dc:language after repeated language changes", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setLanguage(new Intl.Locale("fr-FR"))
      await epub.setLanguage(new Intl.Locale("de-AT"))
    })
    const children = await metadataChildren(buffer)

    expect(
      children.filter((child) => child.localName === "language"),
    ).toHaveLength(1)
  })

  it("writes the language subtag as the author supplied it", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setLanguage(new Intl.Locale("en-GB"))
    })
    const children = await metadataChildren(buffer)
    const language = children.find((child) => child.localName === "language")

    // BCP47 region subtags are uppercase; lowercasing them is not required to
    // be tolerated by every reading system.
    expect(language?.textContent?.trim()).toBe("en-GB")
  })

  it("puts the identifier named by unique-identifier in an id attribute", async () => {
    const { buffer } = await createPublication()
    const children = await metadataChildren(buffer)

    // "This dc:identifier element MUST specify an id attribute whose value is
    // referenced from the package element's unique-identifier attribute."
    const identifier = children.find(
      (child) => child.localName === "identifier",
    )
    expect(identifier?.getAttribute("id")).toBeTruthy()
  })
})

describe("5.5.5 last modified date", () => {
  it("contains exactly one dcterms:modified property", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setTitle("One")
      await epub.setTitle("Two")
      await epub.addCreator({ name: "Someone" })
      await epub.setLanguage(new Intl.Locale("en"))
    })
    const children = await metadataChildren(buffer)

    // "The metadata section MUST contain exactly one dcterms:modified
    // property containing the last modification date."
    expect(metaProperty(children, "dcterms:modified")).toHaveLength(1)
  })

  it("writes the modified date as YYYY-MM-DDThh:mm:ssZ", async () => {
    const { buffer } = await createPublication()
    const children = await metadataChildren(buffer)
    const modified = metaProperty(children, "dcterms:modified")[0]

    // "The value of this property MUST be an iso8601-1 complete representation
    // … matching the extended format: YYYY-MM-DDThh:mm:ssZ" and "MUST terminate
    // it with the "Z" (Zulu) time zone indicator."
    expect(modified?.textContent?.trim()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    )
  })

  it("writes the publication date with a Zulu suffix when given a Date", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.setPublicationDate(new Date("2001-02-03T03:04:05Z"))
    })
    const children = await metadataChildren(buffer)
    const dates = children.filter((child) => child.localName === "date")

    expect(dates.length).toBeGreaterThanOrEqual(1)
    // A date without a zone is not an unambiguous iso8601 representation.
    expect(dates[0]?.textContent?.trim()).toMatch(/Z$/)
  })
})

describe("5.5.2 refining metadata", () => {
  it("refines the collection element from collection-type and group-position", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addCollection({
        name: "Series Name",
        position: "3",
        type: "series",
      })
    })
    const children = await metadataChildren(buffer)

    const collection = metaProperty(children, "belongs-to-collection")[0]
    if (!collection) throw new Error("no belongs-to-collection meta")

    const id = collection.getAttribute("id")
    expect(id).toBeTruthy()

    // The refining metas have to point back at the refined element.
    const refiners = children.filter((child) =>
      (child.getAttribute("refines") ?? "").startsWith("#"),
    )
    const refinesThisCollection = refiners.filter(
      (child) => child.getAttribute("refines") === `#${id}`,
    )
    const properties = refinesThisCollection.map((child) =>
      child.getAttribute("property"),
    )
    expect(properties).toContain("collection-type")
    expect(properties).toContain("group-position")
  })

  it("leaves no dangling refines target after removing a collection", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addCollection({ name: "One", position: "1", type: "series" })
      await epub.addCollection({ name: "Two", position: "2", type: "series" })
      await epub.removeCollection(0)
    })
    const children = await metadataChildren(buffer)

    const ids = new Set(
      children
        .map((child) => child.getAttribute("id"))
        .filter((id): id is string => !!id),
    )

    const dangling = children
      .map((child) => child.getAttribute("refines"))
      .filter((refines): refines is string => !!refines)
      .map((refines) => refines.slice(1))
      .filter((target) => !ids.has(target))

    // A refines fragment is an IDREF [xml]; dangling ones are invalid.
    expect(dangling).toEqual([])
  })

  it("keeps creator role and file-as refinements pointing at the creator", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addCreator({
        name: "Jane Doe",
        role: "aut",
        fileAs: "Doe, Jane",
      })
    })
    const children = await metadataChildren(buffer)

    const creator = children.find((child) => child.localName === "creator")
    if (!creator) throw new Error("no dc:creator element")

    const id = creator.getAttribute("id")
    expect(id).toBeTruthy()

    const properties = children
      .filter((child) => child.getAttribute("refines") === `#${id}`)
      .map((child) => child.getAttribute("property"))

    expect(properties).toContain("role")
    expect(properties).toContain("file-as")
  })
})

describe("5.5 metadata round-trips", () => {
  async function fromMetadata(metadata: string) {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({ metadata }),
    })
    return Epub.using(MemoryAdapter).from(epubBuffer)
  }

  it("recognises a spec title-type of subtitle", async () => {
    using epub = await fromMetadata(`    ${REQUIRED_METADATA}
    <dc:title id="t1">Main Title</dc:title>
    <meta refines="#t1" property="title-type">subtitle</meta>`)

    // D.3.13 lists main, subtitle, short, collection, edition and expanded as
    // the title type values reading systems should recognise.
    expect(await epub.getSubtitle()).toBe("Main Title")
    expect(await epub.getTitle()).toBe("Conformance Fixture")
  })

  it("reads a collection whose refining metas appear before it", async () => {
    using epub = await fromMetadata(`    ${REQUIRED_METADATA}
    <meta refines="#c1" property="collection-type">series</meta>
    <meta id="c1" property="belongs-to-collection">Roundtrip Series</meta>`)

    const collections = await epub.getCollections()
    expect(collections).toHaveLength(1)
    expect(collections[0]?.name).toBe("Roundtrip Series")
    expect(collections[0]?.type).toBe("series")
  })

  it("reads metadata values that contain entity references", async () => {
    using epub =
      await fromMetadata(`    <dc:identifier id="pub-id">urn:uuid:ent</dc:identifier>
    <dc:title>Tom &lt;Jerry&gt; &amp; Co.</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>`)

    expect(await epub.getTitle()).toBe("Tom <Jerry> & Co.")
  })

  it("writes contributors added with addContributor as dc:contributor", async () => {
    const { buffer } = await createPublication(async (epub) => {
      await epub.addContributor({ name: "Editor Person" })
    })
    const children = await metadataChildren(buffer)

    // 5.5.3.2.2: a secondary role is a dc:contributor element.
    const contributors = children.filter(
      (child) => child.localName === "contributor",
    )
    expect(contributors).toHaveLength(1)
    expect(contributors[0]?.textContent?.trim()).toBe("Editor Person")
  })

  it("writes DublinCore contributors as dc:contributor on create", async () => {
    const path = await tempPath("contributors.epub")
    const epub = await Epub.using(TmpFsAdapter).create(path, {
      title: "Contributors Test",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:cc1",
      creators: [{ name: "Author Person" }],
      contributors: [{ name: "Editor Person" }],
    })
    await epub.saveAndClose()

    const children = await metadataChildren(await readFile(path))
    const names = children
      .filter(
        (child) =>
          child.localName === "creator" || child.localName === "contributor",
      )
      .map((child) => `${child.localName}:${child.textContent?.trim()}`)

    expect(names).toEqual([
      "creator:Author Person",
      "contributor:Editor Person",
    ])
  })

  it("reads dc:contributor elements as contributors, not creators", async () => {
    using epub = await fromMetadata(`    ${REQUIRED_METADATA}
    <dc:creator id="cr1">Author Person</dc:creator>
    <dc:contributor id="cb1">Editor Person</dc:contributor>`)

    const creators = await epub.getCreators()
    const contributors = await epub.getContributors()

    // 5.5.3.2.2: dc:contributor "represents the name of a person, organization,
    // etc. that played a secondary role in the creation of the content."
    expect(creators.map((creator) => creator.name)).toEqual(["Author Person"])
    expect(contributors.map((contributor) => contributor.name)).toEqual([
      "Editor Person",
    ])
  })
})
