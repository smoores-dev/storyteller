import { describe, it } from "node:test"
import {
  SentenceRange,
  StorytellerTranscription,
  getChapterDuration,
  getSentenceRanges,
} from "../getSentenceRanges"
import { join } from "node:path"

import transcription from "../../__fixtures__/mobydick_001_002_melville.json"
import expected from "../../__fixtures__/mobydickch1_2sentenceranges.json"
import { Epub } from "../epub"
import { tokenizeSentences } from "../nlp"
import assert from "node:assert"

const stTranscription: StorytellerTranscription = {
  segments: transcription.segments.map((segment) => ({
    ...segment,
    audiofile: join(
      "synchronize",
      "__fixtures__",
      "mobydick_001_002_melville.mp3",
    ),
  })),
}

describe("getSentenceRanges", () => {
  it("accurately find sentences ranges", async () => {
    const epub = await Epub.from(join("__fixtures__", "moby-dick.epub"))
    const spine = await epub.getSpineItems()
    const chapterOneText = await epub.readXhtmlItemContents(
      spine[1]!.id,
      "text",
    )
    const sentences = tokenizeSentences(chapterOneText.slice(30888))

    const output = await getSentenceRanges(
      0,
      stTranscription,
      sentences,
      31,
      null,
    )

    assert.deepStrictEqual(output, expected)
    await epub.close()
  })
})

describe("getChapterDuration", () => {
  it("can find the total duration of a chapter", () => {
    const input: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 5,
        audiofile: "1.mp3",
      },
      {
        id: 0,
        start: 5,
        end: 10,
        audiofile: "1.mp3",
      },
      {
        id: 0,
        start: 10,
        end: 15,
        audiofile: "1.mp3",
      },
      {
        id: 0,
        start: 15,
        end: 20,
        audiofile: "1.mp3",
      },
    ]

    const output = getChapterDuration(input)

    assert.strictEqual(output, 20)
  })

  it("can find durations across multiple audio files", () => {
    const input: SentenceRange[] = [
      {
        id: 0,
        start: 10,
        end: 15,
        audiofile: "1.mp3",
      },
      {
        id: 0,
        start: 15,
        end: 20,
        audiofile: "1.mp3",
      },
      {
        id: 0,
        start: 0,
        end: 5,
        audiofile: "2.mp3",
      },
      {
        id: 0,
        start: 5,
        end: 10,
        audiofile: "2.mp3",
      },
    ]

    const output = getChapterDuration(input)

    assert.strictEqual(output, 20)
  })
})
