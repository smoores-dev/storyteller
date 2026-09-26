import assert from "node:assert/strict"
import { test } from "vitest"

import {
  firstClipInResource,
  isStandaloneAudiobookLocator,
  normalizeResourceHref,
  positionForProgression,
} from "./locatorFormat"

const position = (href: string, totalProgression: number) => ({
  href,
  type: "application/xhtml+xml",
  locations: { totalProgression },
})

test("normalizes hrefs across formats and readers", () => {
  assert.equal(normalizeResourceHref("OPS/c01.xhtml"), "ops/c01.xhtml")
  assert.equal(normalizeResourceHref("./OPS/c01.xhtml"), "ops/c01.xhtml")
  assert.equal(normalizeResourceHref("/OPS/c01.xhtml"), "ops/c01.xhtml")
  assert.equal(
    normalizeResourceHref("OPS/c01.xhtml#c01-sentence3"),
    "ops/c01.xhtml",
  )
  assert.equal(
    normalizeResourceHref("OEBPS/Chapter%201.xhtml"),
    "oebps/chapter 1.xhtml",
  )
  assert.equal(normalizeResourceHref("OEBPS/c01%23sentence1"), "oebps/c01")
  assert.equal(normalizeResourceHref("%%%"), "%%%")
  assert.equal(normalizeResourceHref(null), "")
})

test("recognizes a position saved by the standalone audiobook", () => {
  const audiobookLocator = {
    href: "n13final.mp3",
    type: "audio/mp4",
    locations: { fragments: ["t=0"], progression: 0, totalProgression: 0 },
  }

  assert.equal(isStandaloneAudiobookLocator(audiobookLocator), true)
  assert.equal(
    isStandaloneAudiobookLocator({
      ...audiobookLocator,
      type: "application/octet-stream",
    }),
    true,
    "audio file extensions are enough on their own",
  )
  assert.equal(
    isStandaloneAudiobookLocator(
      { href: "n13final", type: "application/octet-stream" },
      ["n13final.mp3", "02.mp3"],
    ),
    false,
    "the audiobook's own hrefs are matched on the whole resource",
  )
  assert.equal(
    isStandaloneAudiobookLocator(
      { href: "n13final", type: "application/octet-stream" },
      ["n13final"],
    ),
    true,
  )
})

test("leaves text locators alone", () => {
  assert.equal(
    isStandaloneAudiobookLocator({
      href: "OPS/c01.xhtml",
      type: "application/xhtml+xml",
      locations: { fragments: ["c01-sentence1"], totalProgression: 0.2 },
    }),
    false,
  )
  assert.equal(
    isStandaloneAudiobookLocator({
      href: "Audio/introduction.xhtml",
      type: "application/xhtml+xml",
    }),
    false,
  )
  assert.equal(isStandaloneAudiobookLocator(null), false)
})

test("maps a progression onto the last position at or before it", () => {
  const positions = [
    position("OPS/front.xhtml", 0),
    position("OPS/c01.xhtml", 0.25),
    position("OPS/c02.xhtml", 0.5),
    position("OPS/back.xhtml", 0.75),
  ]

  assert.equal(positionForProgression(positions, 0)?.href, "OPS/front.xhtml")
  assert.equal(positionForProgression(positions, 0.4)?.href, "OPS/c01.xhtml")
  assert.equal(positionForProgression(positions, 0.5)?.href, "OPS/c02.xhtml")
  assert.equal(positionForProgression(positions, 0.99)?.href, "OPS/back.xhtml")
  assert.equal(
    positionForProgression(positions)?.href,
    "OPS/front.xhtml",
    "an unknown progression starts at the beginning",
  )
  assert.equal(positionForProgression([], 0.5), null)
  assert.equal(positionForProgression(null, 0.5), null)
})

test("finds the first clip of a resource", () => {
  const clips = [
    {
      relativeUrl: "OPS/Audio/00001-00001.mp4",
      fragmentId: "c01-sentence0",
      start: 10,
      end: 12,
      duration: 2,
      textResource: "OPS/c01.xhtml",
      locator: { href: "OPS/c01.xhtml", type: "application/xhtml+xml" },
    },
    {
      relativeUrl: "OPS/Audio/00001-00001.mp4",
      fragmentId: "c01-sentence1",
      start: 12,
      end: 14,
      duration: 2,
      textResource: "OPS/c01.xhtml",
      locator: { href: "OPS/c01.xhtml", type: "application/xhtml+xml" },
    },
  ]

  assert.equal(
    firstClipInResource(clips, "OPS/c01.xhtml")?.fragmentId,
    "c01-sentence0",
    "resumes at the first sentence of the resource",
  )
  assert.equal(
    firstClipInResource(clips, "OPS/C01.XHTML")?.fragmentId,
    "c01-sentence0",
  )
  assert.equal(firstClipInResource(clips, "OPS/c02.xhtml"), null)
  assert.equal(firstClipInResource(null, "OPS/c01.xhtml"), null)
})
