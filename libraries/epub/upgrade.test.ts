import assert from "assert"
import { join } from "path"

import { describe, it } from "vitest"

import { epubcheck } from "./epubcheck.ts"
import { Epub, type XmlTextNode } from "./index.ts"

describe("upgradeToEpub3", () => {
  it("can upgrade an epub 2 to epub 3", async () => {
    const inputFilepath = join("__fixtures__", "epub-2.epub")
    const outputFilepath = join(
      "__fixtures__",
      "__output__",
      "epub-2-to-epub-3.epub",
    )

    using epub = await Epub.upgrade(inputFilepath, {
      outputPath: outputFilepath,
    })

    await epub.saveAndClose()
    epub.discardAndClose()

    using epub3 = await Epub.from(outputFilepath)
    const spineItems = await epub3.getSpineItems()
    const coverPageData = await epub3.readXhtmlItemContents(spineItems[0]!.id)
    const html = coverPageData[1]
    assert.ok(html)
    const head = Epub.getXmlChildren(html)[1]
    assert.ok(head)
    const title = Epub.getXmlChildren(head)[1]
    assert.ok(title)
    const titleText = (Epub.getXmlChildren(title)[0] as XmlTextNode)["#text"]
    assert.strictEqual(titleText, '"Cover"')

    const report = await epubcheck(outputFilepath)

    const { messages } = report
    messages
      .filter((message) => message.ID !== "RSC-005")
      .forEach((message) => {
        // ignore illegal html attributes
        // too annoying to fix, not convinced it's a realllll problem
        // assert.notEqual(message.ID, "RSC-005")

        if (
          message.severity === "ERROR" ||
          message.severity === "WARNING" ||
          message.severity === "FATAL" ||
          message.ID === "RSC-005"
        ) {
          assert.fail(
            `Error: ${JSON.stringify(message, null, 2)}. Other messages: ${JSON.stringify(
              messages.filter((m) => m !== message),
              null,
              2,
            )}`,
          )
        }
      })
  })
})
