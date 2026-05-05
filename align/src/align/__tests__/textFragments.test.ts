import assert from "node:assert"
import { describe, it } from "node:test"

import { segmentText } from "@echogarden/text-segmentation"

import { TextFragmentFactory } from "../textFragments.ts"

void describe("findMinimalFragment", () => {
  void it("should find a minimal fragment when there are no overlaps", async () => {
    const { sentences } = await segmentText(
      "This is a short snippet of text. It has several sentences. None of them have the same initial or final word.",
      {
        language: "en",
      },
    )

    const factory = new TextFragmentFactory(sentences.map((s) => s.text))

    assert.strictEqual(factory.findMinimalFragment(0), ":~:text=this,text")
    assert.strictEqual(factory.findMinimalFragment(1), ":~:text=it,sentences")
    assert.strictEqual(factory.findMinimalFragment(2), ":~:text=none,word")
  })

  void it("should find a unique fragment when there are overlaps", async () => {
    const { sentences } = await segmentText(
      "This is a sentence with some words. This is another sentence with more words.",
      {
        language: "en",
      },
    )

    const factory = new TextFragmentFactory(sentences.map((s) => s.text))

    assert.strictEqual(factory.findMinimalFragment(0), ":~:text=this,words")
    assert.strictEqual(
      factory.findMinimalFragment(1),
      ":~:text=this%20is%20another,words",
    )
  })

  void it("should find a unique fragment when there are mid-sentence overlaps", async () => {
    const { sentences } = await segmentText(
      "There is a man named John McClane. John McClane is unequivocally a badass.",
      {
        language: "en",
      },
    )

    const factory = new TextFragmentFactory(sentences.map((s) => s.text))

    assert.strictEqual(factory.findMinimalFragment(0), ":~:text=there,mcclane")
    assert.strictEqual(
      factory.findMinimalFragment(1),
      ":~:text=john%20mcclane%20is,badass",
    )
  })

  void it("should find a unique fragment when there are equivalent sentences", async () => {
    const { sentences } = await segmentText(
      "This is a simple sentence. This is a slightly more complex sentence. This is a simple sentence.",
      {
        language: "en",
      },
    )

    const factory = new TextFragmentFactory(sentences.map((s) => s.text))

    assert.strictEqual(factory.findMinimalFragment(0), ":~:text=this,sentence")
    assert.strictEqual(
      factory.findMinimalFragment(2),
      ":~:text=sentence.%20-,this%20is%20a%20simple%20sentence.",
    )
  })

  void it("should find a unique fragment when there are equivalent sentences with partially equivalent prefixes", async () => {
    const { sentences } = await segmentText(
      "This is a sentence at the beginning. This is a simple sentence. This is a slightly more complex sentence. This is a simple sentence. This is a sentence at the end.",
      {
        language: "en",
      },
    )

    const factory = new TextFragmentFactory(sentences.map((s) => s.text))

    assert.strictEqual(
      factory.findMinimalFragment(1),
      ":~:text=this%20is%20a%20simple,sentence",
    )
    assert.strictEqual(
      factory.findMinimalFragment(3),
      ":~:text=sentence.%20-,this%20is%20a%20simple%20sentence.%20",
    )
  })
})
