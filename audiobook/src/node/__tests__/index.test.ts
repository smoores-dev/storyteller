import assert from "node:assert"
import { copyFile, mkdir } from "node:fs/promises"
import { describe, it } from "node:test"

import { Picture } from "node-taglib-sharp"

import { Audiobook } from "../index.ts"

void describe("node/Audiobook", () => {
  void it("can be created from a file", async () => {
    await mkdir("src/__fixtures__/__output__/", { recursive: true })
    await copyFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/unedited.mp3",
    )
    const audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/unedited.mp3",
    )
    await audiobook.save()
    audiobook.close()
  })

  void it("can get the title of an audiobook", async () => {
    const audiobook = await Audiobook.from(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )

    const title = await audiobook.getTitle()

    assert.strictEqual(title, "The Legend Of Sleepy Hollow")
    audiobook.close()
  })

  void it("can set the title of an audiobook", async () => {
    await mkdir("src/__fixtures__/__output__/", { recursive: true })
    await copyFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/settitle.mp3",
    )

    const audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/settitle.mp3",
    )

    await audiobook.setTitle("Test Title")

    await audiobook.save()
    audiobook.close()

    const actual = await Audiobook.from(
      "src/__fixtures__/__output__/settitle.mp3",
    )

    const title = await actual.getTitle()

    assert.strictEqual(title, "Test Title")
    actual.close()
  })

  void it("can get the cover of an audiobook", async () => {
    const audiobook = await Audiobook.from(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )

    const cover = await audiobook.getCoverArt()

    assert.strictEqual(cover?.data.length, 155517)
    audiobook.close()
  })

  void it("can set the cover of an audiobook", async () => {
    await mkdir("src/__fixtures__/__output__/", { recursive: true })
    await copyFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/setcover.mp3",
    )
    const audiobook = await Audiobook.from(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )

    const picture = Picture.fromPath("src/__fixtures__/sleepy_hollow.jpg")

    await audiobook.setCoverArt(picture)

    await audiobook.save()
    audiobook.close()

    const actual = await Audiobook.from(
      "src/__fixtures__/__output__/setcover.mp3",
    )

    const cover = await actual.getCoverArt()

    assert.strictEqual(cover?.data.length, 155517)
    actual.close()
  })
})
