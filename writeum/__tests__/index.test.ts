import { join } from "node:path"
import { describe, it } from "node:test"
import { Epub, read } from ".."
import assert from "node:assert"

describe("read", () => {
  it("should produce an Epub", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await read(filepath)
    assert.ok(epub instanceof Epub)
  })
})

describe("Epub", () => {
  it("should parse the spine correctly", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await read(filepath)
    const spineItems = await epub.getSpineItems()
    assert.equal(spineItems.length, 12)
  })

  it("should be able to locate spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await read(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readItemContents(
      spineItems[0]!.href,
      "utf-8",
    )
    assert.ok(coverPageData.startsWith("\n<!DOCTYPE html>"))
  })

  it("should be able to parse xhtml spine items", async () => {
    const filepath = join("__fixtures__", "moby-dick.epub")
    const epub = await read(filepath)
    const spineItems = await epub.getSpineItems()
    const coverPageData = await epub.readXhtmlItem(spineItems[0]!.href)
    assert.ok(coverPageData[0]!["html"])
    assert.ok(coverPageData[0]!["html"]![0]!["head"]![0])
    assert.equal(
      coverPageData[0]!["html"]![0]!["head"]![0]!["title"]![0]!["#text"],
      '"Cover"',
    )
  })
})
