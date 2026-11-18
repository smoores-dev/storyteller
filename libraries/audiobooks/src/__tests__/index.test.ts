import assert from "node:assert"
import { cp } from "node:fs/promises"

import { describe, it } from "vitest"

import { Audiobook, getAttachedImageFromPath } from "../index.ts"

describe("Audiobook", () => {
  it("can be created from a file path", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    await audiobook.saveAndClose()
  })

  it("can be created from a zip archive", async () => {
    await cp(
      "src/__fixtures__/moby-dick-1-7-audio.zip",
      "src/__fixtures__/__output__/moby-dick-1-7-audio.zip",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/moby-dick-1-7-audio.zip",
    )
    await audiobook.saveAndClose()
  })

  it("can get the title of an audiobook", async () => {
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

  it("can set the title of an audiobook", async () => {
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

  it("can set the release date of an audiobook", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_release_date.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_release_date.mp3",
    )
    await audiobook.setReleaseDate(new Date("2007-03-14T00:00:00.000Z"))
    await audiobook.saveAndClose()
    using actual = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_release_date.mp3",
    )
    const releaseDate = await actual.getReleaseDate()
    assert.strictEqual(releaseDate?.toISOString(), "2007-03-14T00:00:00.000Z")
  })

  it("can get the cover of an audiobook", async () => {
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

  it("can set the cover of an audiobook", async () => {
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

  it("preserves chapter metadata", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const chapters = await audiobook.getChapters()
    await audiobook.saveAndClose()
    using updated = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    const updatedChapters = await updated.getChapters()

    assert.deepStrictEqual(chapters, updatedChapters)
  })

  it("exposes raw container tags, including ones not mapped to metadata", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )

    const raw = await audiobook.getRawTags()

    // `encoder` isn't one of the tags we map to known metadata, so its presence
    // proves getRawTags surfaces arbitrary tags (e.g. audible_asin) verbatim
    assert.ok("encoder" in raw)
    // keys are lowercased
    assert.ok(Object.keys(raw).every((key) => key === key.toLowerCase()))
  })

  it("reads a single raw tag case-insensitively", async () => {
    await cp(
      "src/__fixtures__/sleepy_hollow_irving_64kb.mp3",
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )
    using audiobook = await Audiobook.from(
      "src/__fixtures__/__output__/sleepy_hollow_irving_64kb.mp3",
    )

    const raw = await audiobook.getRawTags()
    assert.strictEqual(await audiobook.getRawTag("ENCODER"), raw["encoder"])
    assert.strictEqual(await audiobook.getRawTag("does-not-exist"), null)
  })
})
