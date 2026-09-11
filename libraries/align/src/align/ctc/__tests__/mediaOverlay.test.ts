import assert from "node:assert"
import { describe, it } from "node:test"

import { Epub, type ManifestItem } from "@storyteller-platform/epub"

import { type SentenceRange, type WordRange } from "../../getSentenceRanges.ts"
import { SMIL_PREFIX, createMediaOverlay } from "../mediaOverlay.ts"

const chapter: ManifestItem = {
  id: "ch1",
  href: "Text/ch1.xhtml",
  mediaType: "application/xhtml+xml",
}

function range(id: number, state: SentenceRange["state"]): SentenceRange {
  return {
    id,
    chapterId: "ch1",
    start: id * 2,
    end: id * 2 + 2,
    audiofile: "/tmp/track.mp4",
    state,
  }
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

function attributesOf(element: unknown) {
  return Epub.getXmlAttributes(element as Parameters<typeof Epub.getXmlAttributes>[0])
}

void describe("createMediaOverlay", () => {
  void it("declares the vocabulary and marks each par with its state", () => {
    const [smil] = createMediaOverlay(
      chapter,
      "sentence",
      [range(0, "unmatched"), range(1, "matched"), range(2, "dropped")],
      new Map(),
      null,
      fragments,
      new Map(),
    )

    assert.strictEqual(attributesOf(smil)["epub:prefix"], SMIL_PREFIX)

    const body = Epub.findXmlChildByName("body", Epub.getXmlChildren(smil!))
    const seq = Epub.findXmlChildByName("seq", Epub.getXmlChildren(body!))
    assert.strictEqual(attributesOf(seq)["epub:type"], "chapter")

    const pars = Epub.getXmlChildren(seq!).filter(
      (node) => !Epub.isXmlTextNode(node),
    )
    assert.deepStrictEqual(
      pars.map((par) => attributesOf(par)["epub:type"]),
      [
        "storyteller:unmatched",
        "storyteller:matched",
        "storyteller:dropped",
      ],
    )
  })

  void it("marks the sentence seq and the word pars in word mode", () => {
    const [smil] = createMediaOverlay(
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

    const body = Epub.findXmlChildByName("body", Epub.getXmlChildren(smil!))
    const chapterSeq = Epub.findXmlChildByName(
      "seq",
      Epub.getXmlChildren(body!),
    )
    const sentenceSeq = Epub.findXmlChildByName(
      "seq",
      Epub.getXmlChildren(chapterSeq!),
    )
    assert.strictEqual(
      attributesOf(sentenceSeq)["epub:type"],
      "text-range-small storyteller:matched",
    )
    const pars = Epub.getXmlChildren(sentenceSeq!).filter(
      (node) => !Epub.isXmlTextNode(node),
    )
    assert.deepStrictEqual(
      pars.map((par) => attributesOf(par)["epub:type"]),
      ["storyteller:matched", "storyteller:interpolated"],
    )
  })
})
