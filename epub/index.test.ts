import { join } from "node:path"
import { describe, it } from "node:test"
import {
  Epub,
  MetadataEntry,
  ParsedXml,
  XmlElement,
  XmlTextNode,
} from "./index.js"
import assert from "node:assert"
import { stat } from "node:fs/promises"
import { streamFile } from "@smoores/fs"

void describe("xhtml parsing", () => {
  void it("can handle self-closing stop nodes", () => {
    const xmlString = `<script src="script.js"/>`
    const parsed = Epub.xhtmlParser.parse(xmlString) as ParsedXml

    const built = Epub.xhtmlBuilder.build(parsed) as string

    assert.strictEqual(built, xmlString)
  })
})

void describe("Epub", () => {
  void it("can be created from scratch", async () => {
    const epub = await Epub.create({
      title: "Title",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })
    const title = await epub.getTitle()
    assert.equal(title, "Title")
    const outputPath = join("__fixtures__", "__output__", "created.epub")
    await epub.writeToFile(outputPath)
    await epub.close()
    const info = await stat(outputPath)
    assert.ok(info.isFile())
  })

  void it("strips leading and trailing whitespace from metadata values", async () => {
    const epub = await Epub.create({
      title: "\n  Title\n",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })
    const title = await epub.getTitle()
    assert.equal(title, "Title")
    await epub.close()
  })

  void it("collapses internal whitespace from metadata values", async () => {
    const epub = await Epub.create({
      title: "Test  \tTitle",
      language: new Intl.Locale("en-US"),
      identifier: "1",
    })
    const title = await epub.getTitle()
    assert.equal(title, "Test Title")
    await epub.close()
  })

  void it("can read from an archived .epub file", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    assert.ok(epub instanceof Epub)
    await epub.close()
  })

  void it("can read from a data array representing a .epub file", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const data = await streamFile(filepath)
    const epub = await Epub.from(data)
    assert.ok(epub instanceof Epub)
    await epub.close()
  })

  void it("can parse the spine correctly", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    assert.strictEqual(spineItems.length, 12)
    await epub.close()
  })

  void it("can locate spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readItemContents(
      spineItems[0]!.id,
      "utf-8",
    )
    assert.ok(coverPageData.startsWith("\n<!DOCTYPE html>"))
    await epub.close()
  })

  void it("can parse xhtml spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItemContents(spineItems[0]!.id)
    const html = coverPageData[0] as XmlElement<"html">
    assert.ok(html)
    const head = Epub.getXmlChildren(html)[1] as XmlElement<"head">
    assert.ok(head)
    const title = Epub.getXmlChildren(head)[1] as XmlElement<"title">
    assert.ok(title)
    const titleText = (Epub.getXmlChildren(title)[0] as XmlTextNode)["#text"]
    assert.strictEqual(titleText, '"Cover"')
    await epub.close()
  })

  void it("can produce text content for xhtml items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
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
    await epub.close()
  })

  void it("can parse void xhtml tags", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const chapterOneData = await epub.readXhtmlItemContents(spineItems[1]!.id)
    const html = chapterOneData[1] as XmlElement<"html">
    assert.ok(html)
    const head = Epub.getXmlChildren(html)[1] as XmlElement<"head">
    assert.ok(head)
    const meta = Epub.getXmlChildren(head)[1] as XmlElement<"meta">
    assert.ok(meta)
    assert.strictEqual(meta[":@"]?.["@_charset"], "utf-8")
    await epub.close()
  })

  void it("can add metadata", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

    const newItem: MetadataEntry = {
      properties: { property: "example" },
      value: "metadata value",
      type: "meta",
      id: "test-metadata",
    }
    await epub.addMetadata(newItem)
    assert.deepEqual(newItem, (await epub.getMetadata()).at(-1))
  })

  void it("replaces the correct metadata entry", async () => {
    // This is to test a regression for !106.  There is still a related issue for malformed epubs.
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

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

  void it("can write the epub to a file", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

    const outputFilepath = join(
      "__fixtures__",
      "__output__",
      "moby-dick-write-to-file.epub",
    )

    await epub.writeToFile(outputFilepath)
    await epub.close()
    const info = await stat(outputFilepath)
    assert.ok(info.isFile())
  })

  void it("writes the last modified time correctly", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

    const startTime = new Date()
    startTime.setMilliseconds(0)
    await epub.writeToArray()
    const endTime = new Date()
    endTime.setMilliseconds(1000) // Round up to next second

    const writeTimeStr = (await epub.getMetadata()).find(
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

  void it("can modify an xhtml item", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItemContents(spineItems[0]!.id)

    const html = coverPageData[0] as XmlElement<"html">
    assert.ok(html)
    const head = Epub.getXmlChildren(html)[1] as XmlElement<"head">
    assert.ok(head)
    const title = Epub.getXmlChildren(head)[1] as XmlElement<"title">
    assert.ok(title)
    const titleText = (Epub.getXmlChildren(title)[0] as XmlTextNode)["#text"]

    assert.notStrictEqual(titleText, "Test title")
    ;(Epub.getXmlChildren(title)[0] as XmlTextNode)["#text"] = "Test title"
    await epub.writeXhtmlItemContents(spineItems[0]!.id, coverPageData)

    const outputFilepath = join(
      "__fixtures__",
      "__output__",
      "moby-dick-modify-xhtml-item.epub",
    )

    await epub.writeToFile(outputFilepath)
    await epub.close()

    const updatedEpub = await Epub.from(outputFilepath)

    const updatedSpineItems = await updatedEpub.getSpineItems()
    const updatedCoverPageData = await updatedEpub.readXhtmlItemContents(
      updatedSpineItems[0]!.id,
    )

    const updatedHtml = updatedCoverPageData[0] as XmlElement<"html">
    assert.ok(updatedHtml)
    const updatedHead = Epub.getXmlChildren(
      updatedHtml,
    )[1] as XmlElement<"head">
    assert.ok(updatedHead)
    const updatedTitle = Epub.getXmlChildren(
      updatedHead,
    )[1] as XmlElement<"title">
    assert.ok(updatedTitle)
    const updatedTitleText = (
      Epub.getXmlChildren(updatedTitle)[0] as XmlTextNode
    )["#text"]

    assert.strictEqual(updatedTitleText, "Test title")
    await updatedEpub.close()
  })

  void it("can add a new manifest item", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const newItem = {
      id: "testitem",
      href: "testitem.xhtml",
      mediaType: "application/xhtml+xml",
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
      Epub.getXhtmlTextContent(Epub.getXhtmlBody(testData)).trim(),
      "Test contents",
    )
    await epub.close()
  })

  void it("can remove a creator", async () => {
    const epub = await Epub.create({
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

  void it("can handle simultaneous package document updates", async () => {
    const epub = await Epub.create({
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
})
