import assert from "node:assert"

import { describe, it } from "vitest"

import {
  findXmlChildByName,
  isElement,
  type ManifestItem,
} from "@storyteller-platform/epub"

import { SentenceRange, type WordRange } from "../../getSentenceRanges.ts"
import { SMIL_PREFIX, createMediaOverlay } from "../mediaOverlay.tsx"

const chapter: ManifestItem = {
  id: "ch1",
  href: "Text/ch1.xhtml",
  mediaType: "application/xhtml+xml",
}

function range(id: number, state: SentenceRange["state"]): SentenceRange {
  return new SentenceRange(
    id,
    "ch1",
    [{ start: id * 2, end: id * 2 + 2, audiofile: "/tmp/track.mp4" }],
    state,
  )
}

function word(sentenceId: number, id: number, state: WordRange["state"]) {
  return {
    id,
    sentenceId,
    chapterId: "ch1",
    start: sentenceId * 2 + id * 0.5,
    end: sentenceId * 2 + id * 0.5 + 0.5,
    audiofile: "/tmp/track.mp4",
    state,
  }
}

const fragments = new Map([
  [0, "ch1-s0"],
  [1, "ch1-s1"],
  [2, "ch1-s2"],
])

describe("createMediaOverlay", () => {
  it("declares the vocabulary and marks each par with its state", () => {
    const smil = createMediaOverlay(
      chapter,
      "sentence",
      [range(0, "unmatched"), range(1, "matched"), range(2, "dropped")],
      new Map(),
      null,
      fragments,
      new Map(),
    )

    assert.strictEqual(smil.getAttribute("epub:prefix"), SMIL_PREFIX)

    const body = findXmlChildByName("body", smil)
    const seq = findXmlChildByName("seq", body!)
    assert.strictEqual(seq!.getAttribute("epub:type"), "chapter")

    const pars = Array.from(seq!.childNodes).filter(isElement)
    assert.deepStrictEqual(
      pars.map((par) => par.getAttribute("epub:type")),
      ["storyteller:unmatched", "storyteller:matched", "storyteller:dropped"],
    )
  })

  it("marks the sentence seq and the word pars in word mode", () => {
    const smil = createMediaOverlay(
      chapter,
      "word",
      [range(0, "matched")],
      new Map([[0, [word(0, 0, "matched"), word(0, 1, "interpolated")]]]),
      null,
      fragments,
      new Map([
        [
          0,
          new Map([
            [0, "ch1-s0-w0"],
            [1, "ch1-s0-w1"],
          ]),
        ],
      ]),
    )

    const body = findXmlChildByName("body", smil)
    const chapterSeq = findXmlChildByName("seq", body!)
    const sentenceSeq = findXmlChildByName("seq", chapterSeq!)
    assert.strictEqual(
      sentenceSeq!.getAttribute("epub:type"),
      "text-range-small storyteller:matched",
    )
    const pars = Array.from(sentenceSeq!.childNodes).filter(isElement)
    assert.deepStrictEqual(
      pars.map((par) => par.getAttribute("epub:type")),
      ["storyteller:matched", "storyteller:interpolated"],
    )
  })
})
