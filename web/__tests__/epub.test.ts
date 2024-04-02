import { join } from "node:path"
import { describe, it } from "node:test"
import { Epub, getBody, textContent } from "../epub"
import assert from "node:assert"
import { stat } from "node:fs/promises"

describe("Epub", () => {
  it("can read from an archived .epub file", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    assert.ok(epub instanceof Epub)
    await epub.close()
  })

  it("can parse the spine correctly", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    assert.strictEqual(spineItems.length, 12)
    await epub.close()
  })

  it("can locate spine items", async () => {
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

  it("can parse xhtml spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItemContents(spineItems[0]!.id)
    assert.ok(coverPageData[0]!["html"])
    assert.ok(coverPageData[0]!["html"]![1]!["head"]![0])
    assert.strictEqual(
      coverPageData[0]!["html"]![1]!["head"]![1]!["title"]![0]!["#text"],
      '"Cover"',
    )
    await epub.close()
  })

  it("can produce text content for xhtml items", async () => {
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

  it("can parse void xhtml tags", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(filepath)
    const spineItems = await epub.getSpineItems()
    const chapterOneData = await epub.readXhtmlItemContents(spineItems[1]!.id)
    assert.ok(chapterOneData[1]!["html"]![1]!["head"]![1]!["meta"])
    assert.strictEqual(
      chapterOneData[1]!["html"]![1]!["head"]![1]![":@"]!["@_charset"],
      "utf-8",
    )
    await epub.close()
  })

  it("can write the epub to a file", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

    const outputFilepath = join(
      "__fixtures__",
      "__output__",
      "moby-dick-write-to-file.epub",
    )

    await epub.writeToFile(outputFilepath)
    const info = await stat(outputFilepath)
    assert.ok(info.isFile)
    await epub.close()
  })

  it("can modify an xhtml item", async () => {
    const inputFilepath = join("__fixtures__", "moby-dick.epub")
    const epub = await Epub.from(inputFilepath)

    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItemContents(spineItems[0]!.id)

    assert.notStrictEqual(
      coverPageData[0]!["html"]![1]!["head"]![1]!["title"]![0]!["#text"],
      "Test title",
    )

    coverPageData[0]!["html"]![1]!["head"]![1]!["title"]![0]!["#text"] =
      "Test title"
    await epub.writeXhtmlItemContents(spineItems[0]!.id, coverPageData, "xhtml")

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

    assert.strictEqual(
      updatedCoverPageData[0]!["html"]![1]!["head"]![1]!["title"]![0]!["#text"],
      "Test title",
    )
    await updatedEpub.close()
  })

  it("can add a new manifest item", async () => {
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

    assert.strictEqual(textContent(getBody(testData)).trim(), "Test contents")
    await epub.close()
  })
})
