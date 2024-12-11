import { describe, it } from "node:test"
import {
  SentenceRange,
  StorytellerTranscription,
  getChapterDuration,
  getSentenceRanges,
  interpolateSentenceRanges,
} from "../getSentenceRanges"
import { dirname, join } from "node:path"
import { exec as execCallback } from "node:child_process"

import mobyDickTranscription from "../../__fixtures__/mobydick_001_002_melville.json"
import expected from "../../__fixtures__/mobydickch1_2sentenceranges.json"
import { Epub } from "../../epub"
import { tokenizeSentences } from "../nlp"
import assert from "node:assert"
import type { TimelineEntry } from "echogarden/dist/utilities/Timeline"
import { promisify } from "node:util"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { getTrackDuration } from "@/audio"

const exec = promisify(execCallback)

// ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t <seconds> -q:a 9 -acodec libmp3lame out.mp3
/**
 * Create an audio track with some length. Track will be
 * silent.
 *
 * Returns the precise length of the created track (which may not
 * be exactly the requested length).
 */
async function createTrack(path: string, length: number) {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  const command = "ffmpeg"
  const args = [
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-t",
    length,
    "-q:a",
    "9",
    "-acodec",
    "libmp3lame",
    path,
  ]

  await exec([command, ...args].join(" "))
  return getTrackDuration(path)
}

void describe("getSentenceRanges", () => {
  void it("accurately find sentences ranges", async () => {
    const epub = await Epub.from(join("src", "__fixtures__", "moby-dick.epub"))
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
          "src",
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

void describe("interpolateSentenceRanges", () => {
  void it("should return contiguous ranges as is", async () => {
    const input: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.45,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 3.45,
        end: 6.74,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, input)
  })

  void it("should interpolate starting sentences of first audiofile", async () => {
    const input: SentenceRange[] = [
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.37,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 3.37,
        end: 6.74,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, expected)
  })

  void it("should interpolate starting sentences of new audiofile", async () => {
    const input: SentenceRange[] = [
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "2.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "2.mp3",
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.37,
        audiofile: "2.mp3",
      },
      {
        id: 1,
        start: 3.37,
        end: 6.74,
        audiofile: "2.mp3",
      },
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "2.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "2.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, {
      id: 10,
      start: 143.2,
      end: 146.8,
      audiofile: "1.mp3",
    })
    assert.deepStrictEqual(output, expected)
  })

  void it("should interpolate starting sentences of same audiofile", async () => {
    const input: SentenceRange[] = [
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 2.1,
        end: 4.42,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 4.42,
        end: 6.74,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, {
      id: 10,
      start: 0,
      end: 2.1,
      audiofile: "1.mp3",
    })
    assert.deepStrictEqual(output, expected)
  })

  void it("should interpolate a sentence within audiofile", async () => {
    const input: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.45,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.45,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 3.45,
        end: 6.74,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        start: 6.74,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, expected)
  })

  void it("should interpolate sentences within audiofile", async () => {
    const input: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.45,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 0,
        end: 3.45,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 3.45,
        // Floating point error
        end: 6.824999999999999,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        // Floating point error
        start: 6.824999999999999,
        end: 10.2,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 10.2,
        end: 12.89,
        audiofile: "1.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, expected)
  })

  void it("should interpolate sentences across audiofiles", async () => {
    const audiofile1 = join(
      "src",
      "__fixtures__",
      "__output__",
      "interpolate-test",
      `${randomUUID()}.mp3`,
    )
    const audiofile2 = join(
      "src",
      "__fixtures__",
      "__output__",
      "interpolate-test",
      `${randomUUID()}.mp3`,
    )
    await Promise.all([
      createTrack(audiofile1, 30),
      createTrack(audiofile2, 30),
    ])

    const input: SentenceRange[] = [
      {
        id: 0,
        start: 24.2,
        end: 26.4,
        audiofile: audiofile1,
      },
      {
        id: 1,
        start: 26.4,
        end: 30,
        audiofile: audiofile1,
      },
      {
        id: 4,
        start: 6.74,
        end: 9.81,
        audiofile: audiofile2,
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 24.2,
        end: 26.4,
        audiofile: audiofile1,
      },
      {
        id: 1,
        start: 26.4,
        end: 30,
        audiofile: audiofile1,
      },
      {
        id: 2,
        start: 0,
        end: 3.37,
        audiofile: audiofile2,
      },
      {
        id: 3,
        start: 3.37,
        end: 6.74,
        audiofile: audiofile2,
      },
      {
        id: 4,
        start: 6.74,
        end: 9.81,
        audiofile: audiofile2,
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, expected)
  })

  void it("should leave space for un-transcribed sentences", async () => {
    const input: SentenceRange[] = [
      {
        id: 0,
        start: 24.2,
        end: 26.4,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 26.4,
        end: 30,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 30,
        end: 32.2,
        audiofile: "1.mp3",
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 24.2,
        end: 26.4,
        audiofile: "1.mp3",
      },
      {
        id: 1,
        start: 26.4,
        end: 29.75,
        audiofile: "1.mp3",
      },
      {
        id: 2,
        start: 29.75,
        end: 30,
        audiofile: "1.mp3",
      },
      {
        id: 3,
        start: 30,
        end: 32.2,
        audiofile: "1.mp3",
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, expected)
  })

  void it("should leave space for un-transcribed sentences across audiofiles", async () => {
    const audiofile1 = join(
      "src",
      "__fixtures__",
      "__output__",
      "interpolate-test",
      `${randomUUID()}.mp3`,
    )
    const audiofile2 = join(
      "src",
      "__fixtures__",
      "__output__",
      "interpolate-test",
      `${randomUUID()}.mp3`,
    )
    const [track1Duration] = await Promise.all([
      createTrack(audiofile1, 30),
      createTrack(audiofile2, 30),
    ])

    const input: SentenceRange[] = [
      {
        id: 0,
        start: 24.2,
        end: 26.4,
        audiofile: audiofile1,
      },
      {
        id: 1,
        start: 26.4,
        end: track1Duration,
        audiofile: audiofile1,
      },
      {
        id: 3,
        start: 0,
        end: 2.2,
        audiofile: audiofile2,
      },
    ]

    const expected: SentenceRange[] = [
      {
        id: 0,
        start: 24.2,
        end: 26.4,
        audiofile: audiofile1,
      },
      {
        id: 1,
        start: 26.4,
        end: track1Duration,
        audiofile: audiofile1,
      },
      {
        id: 2,
        start: 0,
        end: 0.25,
        audiofile: audiofile2,
      },
      {
        id: 3,
        start: 0.25,
        end: 2.2,
        audiofile: audiofile2,
      },
    ]

    const output = await interpolateSentenceRanges(input, null)
    assert.deepStrictEqual(output, expected)
  })
})
