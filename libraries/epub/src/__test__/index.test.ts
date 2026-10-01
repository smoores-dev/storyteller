import assert from "node:assert"
import { cp, readdir, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { type CharacterData, type Element } from "@xmldom/xmldom"
import { describe, it } from "vitest"

import { streamFile } from "@storyteller-platform/fs"
import { MediaType } from "@storyteller-platform/media-types"

import {
  Epub,
  EpubReadOnlyError,
  MemoryAdapter,
  type MetadataEntry,
  TmpFsAdapter,
} from "../index.js"
import { getXhtmlBody, parse, serialize, x } from "../xml.ts"

describe("xhtml parsing", () => {
  it("can handle self-closing stop nodes", () => {
    const xmlString = `<html xmlns="http://www.w3.org/1999/xhtml"><script src="script.js"/></html>`
    const parsed = parse(xmlString, "application/xhtml+xml")

    const built = serialize(parsed)

    assert.strictEqual(
      built,
      // XMLSerializer only self-closes tags that are self-closing in HTML
      `<html xmlns="http://www.w3.org/1999/xhtml"><script src="script.js"></script></html>`,
    )
  })
})

describe("Epub", () => {
  it("can be created from scratch", async () => {
    const outputPath = join("__fixtures__", "__output__", "created.epub")
    using epub = await Epub.using(TmpFsAdapter).create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })
    const title = await epub.getTitle()
    assert.equal(title, "Title")
    await epub.saveAndClose()
    const info = await stat(outputPath)
    assert.ok(info.isFile())
  })

  it("strips leading and trailing whitespace from metadata values", async () => {
    const outputPath = join("__fixtures__", "__output__", "strip.epub")
    using epub = await Epub.using(TmpFsAdapter).create(outputPath, {
      title: "\n  Title\n",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })
    const title = await epub.getTitle()
    assert.equal(title, "Title")
  })

  it("collapses internal whitespace from metadata values", async () => {
    const outputPath = join("__fixtures__", "__output__", "collapse.epub")
    using epub = await Epub.create(outputPath, {
      title: "Test  \tTitle",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })
    const title = await epub.getTitle()
    assert.equal(title, "Test Title")
  })

  it("can read from an archived .epub file", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.using(TmpFsAdapter).from(filepath)
    assert.ok(epub instanceof Epub)
  })

  it("can read from a data array representing a .epub file", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const data = await streamFile(filepath)
    using epub = await Epub.using(TmpFsAdapter).from(data)
    assert.ok(epub instanceof Epub)
  })

  it("can parse the spine correctly", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.using(TmpFsAdapter).from(filepath)
    const spineItems = await epub.getSpineItems()
    assert.strictEqual(spineItems.length, 12)
  })

  it("can locate spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readItemContents(
      spineItems[0]!.id,
      "utf-8",
    )
    assert.ok(coverPageData.startsWith("\n<!DOCTYPE html>"))
  })

  it("can parse xhtml spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItemContents(spineItems[0]!.id)
    const html = coverPageData.documentElement
    assert.ok(html)
    const head = html.children.item(0)
    assert.ok(head)
    const title = head.children.item(0)
    assert.ok(title)
    const titleText = (title.firstChild as CharacterData).data
    assert.strictEqual(titleText, '"Cover"')
  })

  it("can produce text content for xhtml items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const chapterOneData = await epub.readXhtmlItemContents(
      spineItems[1]!.id,
      "text",
    )
    assert.ok(
      chapterOneData.startsWith(
        "The Project Gutenberg eBook of Moby Dick; Or, The Whale",
      ),
    )
  })

  it("can parse void xhtml tags", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.using(TmpFsAdapter).from(filepath)
    const spineItems = await epub.getSpineItems()
    const chapterOneData = await epub.readXhtmlItemContents(spineItems[1]!.id)
    const html = chapterOneData.documentElement
    assert.ok(html)
    const head = html.children.item(0)
    assert.ok(head)
    const meta = head.children.item(0)
    assert.ok(meta)
    assert.strictEqual(meta.getAttribute("charset"), "utf-8")
  })

  it("can add metadata", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.from(inputFilepath)

    const newItem: MetadataEntry = {
      properties: { property: "example" },
      value: "metadata value",
      type: "meta",
      id: "test-metadata",
    }
    await epub.addMetadata(newItem)
    assert.deepEqual(newItem, (await epub.getMetadata()).at(-1))
  })

  it("replaces the correct metadata entry", async () => {
    // This is to test a regression for !106.  There is still a related issue for malformed epubs.
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    using epub = await Epub.using(TmpFsAdapter).from(inputFilepath)

    const firstValue: MetadataEntry = {
      properties: { property: "example" },
      value: "first-value",
      type: "meta",
      id: "test_metadata",
    }
    const secondValue: MetadataEntry = { ...firstValue, value: "second-value" }
    const isAddedEntry = (entry: MetadataEntry) =>
      entry.properties["property"] == "example" &&
      entry.type == "meta" &&
      entry.id == "test_metadata"

    await epub.addMetadata(firstValue)
    await epub.replaceMetadata(isAddedEntry, secondValue)

    assert.equal(-1, (await epub.getMetadata()).indexOf(firstValue))
    assert.deepEqual(secondValue, (await epub.getMetadata()).at(-1))
  })

  it("can write the epub to a file", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")

    const outputFilepath = join(
      "__fixtures__",
      "__output__",
      "moby-dick-write-to-file.epub",
    )

    await cp(inputFilepath, outputFilepath, { force: true })

    using epub = await Epub.using(TmpFsAdapter).from(outputFilepath)
    await epub.saveAndClose()
    const info = await stat(outputFilepath)
    assert.ok(info.isFile())
  })

  it("writes the last modified time correctly", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const outputFilepath = join("__fixtures__", "__output__", "moby-dick.epub")
    await cp(inputFilepath, outputFilepath, { force: true })

    using epub = await Epub.using(TmpFsAdapter).from(outputFilepath)

    const startTime = new Date()
    startTime.setMilliseconds(0)
    await epub.saveAndClose()
    using updatedEpub = await Epub.using(TmpFsAdapter).from(outputFilepath)
    const endTime = new Date()
    endTime.setMilliseconds(1000) // Round up to next second

    const writeTimeStr = (await updatedEpub.getMetadata()).find(
      (elem) => elem.properties["property"] === "dcterms:modified",
    )?.value
    assert.ok(writeTimeStr, "could not find last modified time")
    const writeTime = new Date(writeTimeStr)
    assert.match(
      writeTimeStr,
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/,
      "written time not in correct format",
    )
    assert.ok(
      startTime <= writeTime && writeTime <= endTime,
      "last modified time was not in expected range",
    )
  })

  it("can modify an xhtml item", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const outputFilepath = join("__fixtures__", "__output__", "moby-dick.epub")
    await cp(inputFilepath, outputFilepath, { force: true })
    using epub = await Epub.using(TmpFsAdapter).from(outputFilepath)

    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItemContents(spineItems[0]!.id)

    const html = coverPageData.documentElement
    assert.ok(html)
    const head = html.children.item(0)
    assert.ok(head)
    const title = head.children.item(0)
    assert.ok(title)
    const titleText = title.firstChild as CharacterData

    assert.notStrictEqual(titleText.data, "Test title")
    titleText.replaceData(0, titleText.data.length, "Test title")
    await epub.writeXhtmlItemContents(spineItems[0]!.id, coverPageData)

    await epub.saveAndClose()

    const updatedEpub = await Epub.using(TmpFsAdapter).from(outputFilepath)

    const updatedSpineItems = await updatedEpub.getSpineItems()
    const updatedCoverPageData = await updatedEpub.readXhtmlItemContents(
      updatedSpineItems[0]!.id,
    )

    const updatedHtml = updatedCoverPageData.documentElement
    assert.ok(updatedHtml)
    const updatedHead = updatedHtml.children.item(0)
    assert.ok(updatedHead)
    const updatedTitle = updatedHead.children.item(0)
    assert.ok(updatedTitle)
    const updatedTitleText = updatedTitle.firstChild as CharacterData

    assert.strictEqual(updatedTitleText.data, "Test title")
  })

  it("can add a new manifest item", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const outputFilepath = join("__fixtures__", "__output__", "moby-dick.epub")
    await cp(inputFilepath, outputFilepath, { force: true })
    using epub = await Epub.from(outputFilepath)

    const newItem = {
      id: "testitem",
      href: "testitem.xhtml",
      mediaType: MediaType.XHTML.mime,
      fallback: undefined,
      mediaOverlay: undefined,
      properties: undefined,
    }
    const newContents = `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Test item</title>
    <link href="pgepub.css" rel="stylesheet"/>
  </head>
<body>
  <p>
    Test contents
  </p>
</body>
</html>
`
    await epub.addManifestItem(newItem, newContents, "utf-8")

    const manifest = await epub.getManifest()

    assert.deepStrictEqual(newItem, manifest["testitem"])

    const testData = await epub.readXhtmlItemContents("testitem", "xhtml")

    assert.strictEqual(
      getXhtmlBody(testData).textContent?.trim(),
      "Test contents",
    )
  })

  it("correctly persists and then reads creator roles and file-as", async () => {
    const outputPath = join("__fixtures__", "__output__", "creatorRoles.epub")
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })

    await epub.addCreator({
      name: "John Author",
      role: "aut",
      roleScheme: "marc:relators",
      fileAs: "Author, John",
    })
    await epub.addCreator({
      name: "Jane Narrator",
      role: "nrt",
      roleScheme: "marc:relators",
      fileAs: "Narrator, Jane",
    })
    await epub.addCreator({
      name: "Jimothy Beast",
      role: "adp",
    })

    assert.deepStrictEqual(await epub.getCreators(), [
      {
        name: "John Author",
        role: "aut",
        roleScheme: "marc:relators",
        fileAs: "Author, John",
      },
      {
        name: "Jane Narrator",
        role: "nrt",
        roleScheme: "marc:relators",
        fileAs: "Narrator, Jane",
      },
      {
        name: "Jimothy Beast",
        role: "adp",
      },
    ])
  })

  it("can remove a creator", async () => {
    const outputPath = join("__fixtures__", "__output__", "removeCreator.epub")
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
      creators: [
        {
          name: "Creator 1",
        },
        {
          name: "Creator 2",
        },
        {
          name: "Creator 3",
        },
      ],
    })

    await epub.removeCreator(1)

    const creators = await epub.getCreators()
    assert.equal(creators.length, 2)
    assert.deepStrictEqual(creators[0], {
      name: "Creator 1",
    })
    assert.deepStrictEqual(creators[1], {
      name: "Creator 3",
    })
  })

  it("can remove the first creator", async () => {
    const outputPath = join(
      "__fixtures__",
      "__output__",
      "removeFirstCreator.epub",
    )
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
      creators: [
        {
          name: "Creator 1",
        },
        {
          name: "Creator 2",
        },
        {
          name: "Creator 3",
        },
      ],
    })

    await epub.removeCreator(0)

    const creators = await epub.getCreators()
    assert.equal(creators.length, 2)
    assert.deepStrictEqual(creators[0], {
      name: "Creator 2",
    })
    assert.deepStrictEqual(creators[1], {
      name: "Creator 3",
    })
  })

  it("can remove the first collection", async () => {
    const outputPath = join(
      "__fixtures__",
      "__output__",
      "removeCollection.epub",
    )
    using epub = await Epub.create(
      outputPath,
      {
        title: "Title",
        language: new Intl.Locale("en-US"),
        identifier: "1",
      },
      [
        {
          id: "collection-1",
          properties: {
            property: "belongs-to-collection",
          },
          value: "Collection One",
          type: "meta",
        },
        {
          id: "collection-2",
          properties: {
            property: "belongs-to-collection",
          },
          value: "Collection Two",
          type: "meta",
        },
      ],
    )

    await epub.removeCollection(0)

    const collections = await epub.getCollections()
    assert.equal(collections.length, 1)
    assert.deepStrictEqual(collections[0], {
      name: "Collection Two",
    })
  })

  it("can handle simultaneous package document updates", async () => {
    const outputPath = join(
      "__fixtures__",
      "__output__",
      "parallelUpdates.epub",
    )
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })

    await Promise.all([
      epub.setTitle("Updated title"),
      epub.setLanguage(new Intl.Locale("en-GB")),
      epub.addCreator({ name: "Creator" }),
    ])

    assert.strictEqual(await epub.getTitle(), "Updated title")
    assert.strictEqual((await epub.getLanguage())?.toString(), "en-GB")
    assert.deepStrictEqual(await epub.getCreators(), [{ name: "Creator" }])
  })

  it("can set various title types", async () => {
    const outputPath = join("__fixtures__", "__output__", "titleTypes.epub")
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })

    await epub.setTitles([
      {
        title: "Main title",
        type: "main",
      },
      {
        title: "Subtitle",
        type: "subtitle",
      },
    ])

    assert.strictEqual(await epub.getTitle(), "Main title")
    assert.strictEqual(await epub.getTitle(true), "Main title, Subtitle")
    assert.deepStrictEqual(await epub.getTitles(), [
      { title: "Main title", type: "main" },
      { title: "Subtitle", type: "subtitle" },
    ])
  })

  it("can set series/collections", async () => {
    const outputPath = join("__fixtures__", "__output__", "series.epub")
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })

    await epub.addCollection({
      name: "Series",
      position: "1",
      type: "series",
    })

    await epub.saveAndClose()

    using updated = await Epub.from(outputPath)
    const collections = await updated.getCollections()
    assert.strictEqual(collections.length, 1)
    assert.strictEqual(collections[0]?.name, "Series")
    assert.strictEqual(collections[0].position, "1")
    assert.strictEqual(collections[0].type, "series")
  })

  it("writes and reads back identifiers", async () => {
    const outputPath = join("__fixtures__", "__output__", "identifiers.epub")
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:pub-value",
    })

    await epub.setIdentifiers([
      // an isbn written in the refining ONIX form
      {
        value: "9781685891664",
        identifierType: "15",
        scheme: "onix:codelist5",
      },
      // a vendor id written as a plain prefix:value text form
      { value: "goodreads:223855250" },
      // a scheme-only entry, written via the legacy opf:scheme attribute
      { value: "custom-1", scheme: "MyScheme" },
    ])

    await epub.saveAndClose()

    using updated = await Epub.from(outputPath)

    // the publication's unique identifier is untouched
    assert.strictEqual(
      await updated.getUniqueIdentifier(),
      "urn:uuid:pub-value",
    )

    const identifiers = await updated.getIdentifiers()

    // unique identifier is still present
    assert.ok(identifiers.some((i) => i.value === "urn:uuid:pub-value"))

    // setIdentifiers does not create dc:source entries
    assert.deepStrictEqual(await updated.getSources(), [])

    const isbn = identifiers.find((i) => i.value === "9781685891664")
    assert.strictEqual(isbn?.identifierType, "15")
    assert.strictEqual(isbn.scheme, "onix:codelist5")

    const goodreads = identifiers.find((i) => i.value === "goodreads:223855250")
    assert.ok(goodreads)
    assert.strictEqual(goodreads.identifierType, undefined)
    assert.strictEqual(goodreads.scheme, undefined)

    const custom = identifiers.find((i) => i.value === "custom-1")
    assert.strictEqual(custom?.scheme, "MyScheme")
    assert.strictEqual(custom.identifierType, undefined)
  })

  it("identifiers can be replaced", async () => {
    const outputPath = join(
      "__fixtures__",
      "__output__",
      "replaceIdentifiers.epub",
    )
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:pub-value",
    })

    await epub.setIdentifiers([{ value: "amazon:B0DTN2CKDR" }])
    await epub.setIdentifiers([{ value: "goodreads:223855250" }])
    await epub.saveAndClose()

    using updated = await Epub.from(outputPath)
    const identifiers = await updated.getIdentifiers()

    // the first-written identifier is gone bc we have overwritten it, the second remains
    assert.strictEqual(identifiers.length, 2) // unique and goodreads
    assert.ok(!identifiers.some((i) => i.value === "amazon:B0DTN2CKDR"))
    assert.ok(identifiers.some((i) => i.value === "goodreads:223855250"))
    // and the unique identifier is still intact
    assert.strictEqual(
      await updated.getUniqueIdentifier(),
      "urn:uuid:pub-value",
    )

    // try and set the unique identifier
    await updated.setUniqueIdentifier("urn:uuid:new-value")

    await updated.saveAndClose()

    using updated2 = await Epub.from(outputPath)

    // lets see if we can set the unique identifier
    await updated2.getUniqueIdentifier()
    assert.strictEqual(
      await updated2.getUniqueIdentifier(),
      "urn:uuid:new-value",
    )
    // still have the goodreads identifier
    const identifiers2 = await updated2.getIdentifiers()
    assert.strictEqual(identifiers2.length, 2)
    assert.ok(identifiers2.some((i) => i.value === "goodreads:223855250"))
  })

  it("writes and reads back sources ", async () => {
    const outputPath = join("__fixtures__", "__output__", "sources.epub")
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:pub-value",
    })

    await epub.setIdentifiers([{ value: "goodreads:223855250" }])
    await epub.setSources([
      {
        value: "urn:isbn:9780375704024",
        identifierType: "15",
        scheme: "onix:codelist5",
        isPageBreakSource: true,
      },
    ])
    await epub.saveAndClose()

    using updated = await Epub.from(outputPath)

    const sources = await updated.getSources()
    assert.strictEqual(sources.length, 1)
    assert.strictEqual(sources[0]?.value, "urn:isbn:9780375704024")
    assert.strictEqual(sources[0].identifierType, "15")
    assert.strictEqual(sources[0].scheme, "onix:codelist5")
    assert.strictEqual(sources[0].isPageBreakSource, true)

    // setSources leaves dc:identifier entries untouched
    assert.ok(
      (await updated.getIdentifiers()).some(
        (i) => i.value === "goodreads:223855250",
      ),
    )

    // sources can be removed independently of identifiers
    await updated.setSources([])
    await updated.saveAndClose()

    using cleared = await Epub.from(outputPath)
    assert.deepStrictEqual(await cleared.getSources(), [])
    assert.ok(
      (await cleared.getIdentifiers()).some(
        (i) => i.value === "goodreads:223855250",
      ),
    )
  })

  it("writes, reads and clears the pageBreakSource property", async () => {
    const outputPath = join(
      "__fixtures__",
      "__output__",
      "pageBreakSource.epub",
    )
    using epub = await Epub.create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "urn:uuid:pub-value",
    })

    // absent by default
    assert.strictEqual(await epub.getPageBreakSource(), null)

    // set a source with isPageBreakSource: true
    // leading to a source-of="pagination" refinement
    await epub.setSources([
      {
        id: "realBook",
        value: "urn:isbn:9780010010001",
        identifierType: "15",
        scheme: "onix:codelist5",
        isPageBreakSource: true,
      },
    ])

    // await epub.setPageBreakSource("urn:isbn:9780010010001")
    await epub.saveAndClose()

    using updated = await Epub.from(outputPath)
    // we find it as a fallback (dont care about the id)
    assert.deepStrictEqual(await updated.getPageBreakSource(), {
      id: "realBook",
      value: "urn:isbn:9780010010001",
      identifierType: "15",
      scheme: "onix:codelist5",
      isPageBreakSource: true,
    })
    // clear
    await updated.setSources([])

    await updated.setPageBreakSource("blabla")

    assert.deepStrictEqual(
      await updated.getSources(),
      [],
      "sources should be cleared",
    )

    assert.partialDeepStrictEqual(
      await updated.getPageBreakSource(),
      {
        value: "blabla",
        isPageBreakSource: true,
      },
      "page break source should be set",
    )
    assert.strictEqual(
      (await updated.getMetadata()).filter(
        (m) => m.properties["property"] === "pageBreakSource",
      ).length,
      1,
    )

    // clearing removes it
    await updated.setPageBreakSource(null)
    assert.strictEqual(
      await updated.getPageBreakSource(),
      null,
      "null should clear the page break source",
    )
  })
})

describe("Epub.using(MemoryAdapter) (read-only, in-memory)", () => {
  const fixture = join("__fixtures__", "moby-dick.epub")

  it("reads metadata and content from an in-memory zip", async () => {
    using epub = await Epub.using(MemoryAdapter).from(fixture)
    assert.strictEqual(epub.storage, "in-memory")
    const title = await epub.getTitle()
    assert.ok(title && title.length > 0)
    const spine = await epub.getSpineItems()
    assert.ok(spine.length > 0)
  })

  it("refuses mutations with EpubReadOnlyError", async () => {
    using reader = await Epub.using(MemoryAdapter).from(fixture)
    const asWriter = reader as unknown as Epub

    await assert.rejects(
      asWriter.setTitle("Mutated"),
      (err) => err instanceof EpubReadOnlyError,
      "setTitle should throw EpubReadOnlyError",
    )
    await assert.rejects(
      asWriter.addCreator({ name: "Someone" }),
      (err) => err instanceof EpubReadOnlyError,
      "addCreator should throw EpubReadOnlyError",
    )
    await assert.rejects(
      asWriter.saveAndClose(),
      (err) => err instanceof EpubReadOnlyError,
      "saveAndClose should throw EpubReadOnlyError",
    )
  })

  it("does not leave a temp directory on disk", async () => {
    // the virtualRoot path is constructed for href anchoring but never written
    const prefix = "storyteller-platform-epub-zip-"
    const before = (await readdir(tmpdir())).filter((n) => n.startsWith(prefix))

    // sneaky scope
    {
      using _epub = await Epub.using(MemoryAdapter).from(fixture)
      const during = (await readdir(tmpdir())).filter((n) =>
        n.startsWith(prefix),
      )
      assert.deepStrictEqual(
        during,
        before,
        "MemoryAdapter should not create any temp dir matching the in-memory prefix before disposal",
      )
    }

    const after = (await readdir(tmpdir())).filter((n) => n.startsWith(prefix))
    assert.deepStrictEqual(
      after,
      before,
      "MemoryAdapter should not create any temp dir matching the in-memory prefix",
    )
  })

  it("clears the entry index on dispose", async () => {
    const epub = await Epub.using(MemoryAdapter).from(fixture)
    await epub.getTitle()
    epub.discardAndClose()

    await assert.rejects(
      epub.getTitle(),
      "reading after discardAndClose should fail",
    )
  })

  it("respects cache: false (repeated reads still work)", async () => {
    using epub = await Epub.using(MemoryAdapter).from(fixture, {
      cache: false,
    })
    // read a non-xhtml entry twice. xhtml is memoized separately by `mem`
    // on readXhtmlItemContents, so use a different entry to actually
    // exercise the cache path.
    const manifest = await epub.getManifest()
    const imageEntry = Object.values(manifest).find((item) =>
      item.mediaType?.startsWith("image/"),
    )
    assert.ok(imageEntry, "fixture should contain an image")
    const first = await epub.readItemContents(imageEntry.id)
    const second = await epub.readItemContents(imageEntry.id)
    assert.strictEqual(
      first.byteLength,
      second.byteLength,
      "repeated reads should yield the same bytes regardless of caching",
    )
  })

  it("aborts when the signal is already triggered", async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      Epub.using(MemoryAdapter).from(fixture, { signal: controller.signal }),
      "should throw when signal is pre-aborted",
    )
  })
})

describe("Epub.from (read-only, extracted-dir)", () => {
  const fixture = join("__fixtures__", "moby-dick.epub")

  it("reads metadata with { readonly: true }", async () => {
    using epub = await Epub.from(fixture, { readonly: true })
    // storage remains extracted-dir; only mutations are gated
    assert.strictEqual(epub.storage, "extracted-dir")
    const title = await epub.getTitle()
    assert.ok(title && title.length > 0)
  })

  it("refuses mutations with EpubReadOnlyError", async () => {
    // cast through Epub so we can call mutators that EpubReader hides
    // at the type level. the runtime guard should still trigger.
    using reader = await Epub.from(fixture, { readonly: true })
    const asWriter = reader as unknown as Epub

    await assert.rejects(
      asWriter.setTitle("Mutated"),
      (err) => err instanceof EpubReadOnlyError,
      "setTitle should throw EpubReadOnlyError",
    )
    await assert.rejects(
      asWriter.addCreator({ name: "Someone" }),
      (err) => err instanceof EpubReadOnlyError,
      "addCreator should throw EpubReadOnlyError",
    )
    await assert.rejects(
      asWriter.saveAndClose(),
      (err) => err instanceof EpubReadOnlyError,
      "saveAndClose should throw EpubReadOnlyError",
    )
  })

  it("Epub.from without readonly still allows mutations", async () => {
    using epub = await Epub.from(fixture)
    // we're not actually saving; this just verifies the writer path
    // doesn't have the runtime guard tripped
    await epub.setTitle("Mutated")
    assert.strictEqual(await epub.getTitle(), "Mutated")
  })
})

describe("namespace fidelity", () => {
  it("creates XHTML documents whose elements are in the XHTML namespace", async () => {
    const outputPath = join("__fixtures__", "__output__", "namespaces.epub")
    using epub = await Epub.using(TmpFsAdapter).create(outputPath, {
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })

    const document = await epub.createXhtmlDocument(
      [
        x(
          "nav",
          { "epub:type": "toc" },
          x("h1", null, "Contents"),
          x("ol", null, x("li", null, x("a", { href: "c1.xhtml" }, "One"))),
        ),
      ],
      [x("title", null, "Nav")],
    )

    // `x()` builds elements in no namespace. Inserting them into a document has
    // to give them the namespace the document declares, otherwise the tree
    // reports something the serialized file does not say and nothing can be
    // looked up by namespace.
    const anonymous: string[] = []
    const walk = (element: Element) => {
      if (!element.namespaceURI) anonymous.push(element.nodeName)
      for (const child of Array.from(element.children)) walk(child)
    }
    const root = document.documentElement
    if (!root) throw new Error("no document element")
    walk(root)

    assert.deepStrictEqual(anonymous, [])
  })
})
