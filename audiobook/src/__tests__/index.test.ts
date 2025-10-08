import assert from "node:assert"
import { describe, it } from "node:test"

// import { Picture } from "node-taglib-sharp"

import { streamFile } from "@storyteller-platform/fs"

import { Audiobook, getAttachedImageFromPath } from "../index.ts"

void describe("Audiobook", () => {
  void it("can be created from an arraybuffer", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = new Audiobook({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })
    const [output] = await audiobook.getArraysAndClose()
    assert.strictEqual(output?.filename, "sleepy_hollow_irving_64kb.mp3")
  })

  void it("can be created from a file path", async () => {
    using audiobook = new Audiobook(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    const [output] = await audiobook.getArraysAndClose()
    assert.strictEqual(
      output?.filename,
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
  })

  void it("can be created from a zip archive", async () => {
    using audiobook = new Audiobook("src/__fixtures__/moby-dick-1-7-audio.zip")
    const [output] = await audiobook.getArraysAndClose()
    assert.strictEqual(output?.filename, "/mobydick_001_002_melville.mp3")
  })

  void it("can get the title of an audiobook", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = new Audiobook({
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
    using audiobook = new Audiobook({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })
    await audiobook.setTitle("Test Title")
    const [output] = await audiobook.getArraysAndClose()
    const actual = new Audiobook(output!)
    const title = await actual.getTitle()
    assert.strictEqual(title, "Test Title")
  })

  void it("can get the cover of an audiobook", async () => {
    const data = await streamFile(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = new Audiobook({
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
    using audiobook = new Audiobook({
      filename: "sleepy_hollow_irving_64kb.mp3",
      data,
    })
    const image = await getAttachedImageFromPath(
      "src/__fixtures__/sleepy_hollow.jpg",
      "coverFront",
    )
    await audiobook.setCoverArt(image)
    const [output] = await audiobook.getArraysAndClose()
    const actual = new Audiobook(output!)
    const cover = await actual.getCoverArt()
    assert.strictEqual(cover?.data.length, 155517)
  })
})
