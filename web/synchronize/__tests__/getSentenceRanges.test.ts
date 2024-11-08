import { describe, it } from "node:test"
import {
  SentenceRange,
  StorytellerTranscription,
  getChapterDuration,
  getSentenceRanges,
} from "../getSentenceRanges"
import { join } from "node:path"

import mobyDickTranscription from "../../__fixtures__/mobydick_001_002_melville.json"
import expected from "../../__fixtures__/mobydickch1_2sentenceranges.json"
import { Epub } from "../../epub"
import { tokenizeSentences } from "../nlp"
import assert from "node:assert"
import type { TimelineEntry } from "echogarden/dist/utilities/Timeline"

void describe("getSentenceRanges", () => {
  void it("accurately find sentences ranges", async () => {
    const epub = await Epub.from(join("__fixtures__", "moby-dick.epub"))
    const spine = await epub.getSpineItems()
    const chapterOneText = await epub.readXhtmlItemContents(
      spine[1]!.id,
      "text",
    )
    const sentences = tokenizeSentences(chapterOneText.slice(30888))

    const stTranscription: StorytellerTranscription = {
      transcript: mobyDickTranscription.transcript,
      wordTimeline: mobyDickTranscription.wordTimeline.map((entry) => ({
        ...(entry as TimelineEntry),
        audiofile: join(
          "synchronize",
          "__fixtures__",
          "mobydick_001_002_melville.mp3",
        ),
      })),
    }
    const { sentenceRanges: output } = await getSentenceRanges(
      0,
      stTranscription,
      sentences,
      223,
      null,
      new Map(),
    )

    assert.deepStrictEqual(output, expected)
    await epub.close()
  })
})

void describe("getChapterDuration", () => {
  void it("can find the total duration of a chapter", () => {
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

  void it("can find durations across multiple audio files", () => {
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
