import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join } from "node:path"

import { type Logger } from "pino"

import { type AudiobookChapter } from "@storyteller-platform/audiobook"
import { detectVoiceActivity } from "@storyteller-platform/ghost-story/vad"

import { splitFile } from "../common/ffmpeg.ts"

export async function getSafeChapterRanges(
  input: string,
  duration: number,
  chapters: AudiobookChapter[],
  maxSeconds: number,
  signal?: AbortSignal | null,
  logger?: Logger | null,
) {
  if (!chapters.length) {
    logger?.info(
      `Track is longer than ${maxSeconds / 60} minutes (${duration / 60}m); using VAD to determine safe split points.`,
    )
    const ranges = await getSafeRanges(input, duration, maxSeconds, 0, signal)
    return ranges.map((r) => ({ filepath: input, ...r }))
  }

  const initialRanges = chapters.map((chapter, index) => {
    const next = chapters[index + 1]
    if (!next)
      return {
        filepath: chapter.filename,
        start: chapter.start ?? 0,
        end: duration,
      }

    const end =
      next.filename === chapter.filename ? next.start ?? duration : duration

    return {
      filepath: chapter.filename,
      start: chapter.start ?? 0,
      end,
    }
  })

  const ranges: { filepath: string; start: number; end: number }[] = []

  for (const range of initialRanges) {
    const chapterDuration = range.end - range.start
    if (chapterDuration <= maxSeconds) {
      ranges.push(range)
      continue
    }

    logger?.info(
      `Chapter is longer than ${maxSeconds / 60} minutes (${duration / 60}m); using VAD to determine safe split points.`,
    )

    const chapterRanges = await getSafeRanges(
      range.filepath,
      chapterDuration,
      maxSeconds,
      range.start,
      signal,
      logger,
    )

    ranges.push(
      ...chapterRanges.map((r) => ({ filepath: range.filepath, ...r })),
    )
  }

  return ranges
}

interface Range {
  start: number
  end: number
}

export async function getSafeRanges(
  input: string,
  duration: number,
  maxSeconds: number,
  start = 0,
  signal?: AbortSignal | null,
  logger?: Logger | null,
) {
  const ext = extname(input)
  const rawFilename = basename(input, ext)

  const tmpDir = join(tmpdir(), `storyteller-align-silence-${randomUUID()}`)

  await using stack = new AsyncDisposableStack()
  stack.defer(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  const ranges: Range[] = [{ start, end: duration + start }]

  for (let i = 0; i + 1 < duration / maxSeconds; i++) {
    if (signal?.aborted) throw new Error("Aborted")

    const tmpFilepath = join(tmpDir, i.toString(), `${rawFilename}.wav`)
    await mkdir(dirname(tmpFilepath), { recursive: true })

    const approxCutPoint = start + maxSeconds * (i + 1)
    const searchStart = approxCutPoint - 120
    const searchEnd = approxCutPoint

    await splitFile(
      input,
      tmpFilepath,
      searchStart,
      searchEnd,
      {},
      signal,
      logger,
    )

    const vadTimeline = await detectVoiceActivity(tmpFilepath, {
      engine: "active-gate-og",
    })

    // It's possible for ffmpeg to guess the duration
    // incorrectly, resulting in empty search files.
    // This happens at the very end, so we just bail out
    // if we encounter this.
    if (vadTimeline.length === 0) {
      break
    }

    const silenceTimeline = vadTimeline.reduce<Range[]>((acc, entry) => {
      const lastEntry = acc.at(-1)
      if (!lastEntry) {
        return [
          ...acc,
          {
            start: entry.endTime + searchStart,
            end: entry.endTime + searchStart,
          },
        ]
      }

      return [
        ...acc.slice(0, -1),
        {
          ...lastEntry,
          end: entry.startTime + searchStart,
        },
        {
          start: entry.endTime + searchStart,
          end: entry.endTime + searchStart,
        },
      ]
    }, [])

    const nearestLikelySentenceBreak = silenceTimeline.reduce((acc, entry) => {
      const currLength = acc.end - acc.start
      const entryLength = entry.end - entry.start
      return currLength > entryLength ? acc : entry
    })

    // We initialize this with one element, so there's always at least
    // one element in it
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRange = ranges.at(-1)!
    lastRange.end = nearestLikelySentenceBreak.start
    ranges.push({
      start: nearestLikelySentenceBreak.end,
      end: duration + start,
    })
  }

  return ranges
}
