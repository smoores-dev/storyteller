import assert from "node:assert"
import { cp } from "node:fs/promises"
import { describe, it } from "node:test"

import { Audiobook, getAttachedImageFromPath } from "../index.ts"

void describe("Audiobook", () => {
  void it("can be created from a file path", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    await audiobook.saveAndClose()
  })

  void it("can be created from a zip archive", async () => {
    await cp(
      "src/__fixtures__/moby-dick-1-7-audio.zip",
      "src/__fixtures__/__output__/moby-dick-1-7-audio.zip",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/moby-dick-1-7-audio.zip",
    )
    await audiobook.saveAndClose()
  })

  void it("can get the title of an audiobook", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const title = await audiobook.getTitle()
    assert.strictEqual(title, "The Legend Of Sleepy Hollow")
  })

  void it("can set the title of an audiobook", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    await audiobook.setTitle("Test Title")
    await audiobook.saveAndClose()
    using actual = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const title = await actual.getTitle()
    assert.strictEqual(title, "Test Title")
  })

  void it("can get the cover of an audiobook", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const cover = await audiobook.getCoverArt()
    assert.strictEqual(cover?.data.length, 155517)
  })

  void it("can set the cover of an audiobook", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const image = await getAttachedImageFromPath(
      "src/__fixtures__/sleepy_hollow.jpg",
      "coverFront",
    )
    await audiobook.setCoverArt(image)
    await audiobook.saveAndClose()
    const actual = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const cover = await actual.getCoverArt()
    assert.strictEqual(cover?.data.length, 155517)
  })
})
