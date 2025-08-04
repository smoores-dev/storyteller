import { describe, it } from "node:test"
import { Audiobook } from "../index.js"
import assert from "node:assert"
import { Picture } from "node-taglib-sharp"
import { streamFile } from "@smoores/fs"

void describe("Audiobook", () => {
  void it("can be created from a file", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    const audiobook = await Audiobook.from({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })
    const [output] = await audiobook.save()
    assert.strictEqual(output?.filename, "sleepy_hollow_irving_64kb.mp3")
  })

  void it("can get the title of an audiobook", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    const audiobook = await Audiobook.from({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })

    const title = await audiobook.getTitle()

    assert.strictEqual(title, "The Legend Of Sleepy Hollow")
  })

  void it("can set the title of an audiobook", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    const audiobook = await Audiobook.from({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })

    await audiobook.setTitle("Test Title")

    const [output] = await audiobook.save()

    const actual = await Audiobook.from(output!)

    const title = await actual.getTitle()

    assert.strictEqual(title, "Test Title")
  })

  void it("can get the cover of an audiobook", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    const audiobook = await Audiobook.from({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })

    const cover = await audiobook.getCoverArt()

    assert.strictEqual(cover?.data.length, 155517)
  })

  void it("can set the cover of an audiobook", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    const audiobook = await Audiobook.from({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })

    const picture = Picture.fromPath("src/__fixtures__/sleepy_hollow.jpg")

    await audiobook.setCoverArt(picture)

    const [output] = await audiobook.save()

    const actual = await Audiobook.from(output!)

    const cover = await actual.getCoverArt()

    assert.strictEqual(cover?.data.length, 155517)
  })
})
