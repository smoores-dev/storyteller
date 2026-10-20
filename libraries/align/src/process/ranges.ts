import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

import { type Logger } from "pino"

import { type AudiobookChapter } from "@storyteller-platform/audiobook"
import { scratchPath } from "@storyteller-platform/fs"
import { detectVoiceActivity } from "@storyteller-platform/ghost-story/vad"

import { splitFile } from "../common/ffmpeg.ts"

/**
 * Gaps shorter than this are breaths between words, not breaks between
 * sentences, so they are never used as cut points.
 */
const MIN_SILENCE_SECONDS = 0.25

/** How far, in seconds, a chapter mark may be moved to reach a silence */
const CHAPTER_CUT_MAX_DISTANCE_SECONDS = 10

/** Audio inspected on either side of a chapter mark */
const CHAPTER_CUT_WINDOW_SECONDS = 20

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
    return ranges.map((r) => ({ filepath: input, title: null, ...r }))
  }

  const initialRanges = chapters.map((chapter) => {
    return {
      filepath: chapter.filename,
      title: chapter.title,
      start: chapter.start,
      end: chapter.end,
    }
  })

  await moveChapterCutsToSilence(initialRanges, signal, logger)

  const ranges: {
    filepath: string
    title: string | null
    start: number
    end: number
  }[] = []

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
      ...chapterRanges.map((r) => ({
        filepath: range.filepath,
        title: range.title,
        ...r,
      })),
    )
  }

  return ranges
}

interface Range {
  start: number
  end: number
}

/**
 * Chapter marks in audiobook metadata are sometimes placed incorrectly, so
 * cutting on the mark clips a word or two. Move each cut shared by two
 * chapters in the same file to the nearest silence.
 */
async function moveChapterCutsToSilence(
  ranges: { filepath: string; start: number; end: number }[],
  signal?: AbortSignal | null,
  logger?: Logger | null,
) {
  const tmpDir = scratchPath(`storyteller-align-chapter-cuts-${randomUUID()}`)

  await using stack = new AsyncDisposableStack()
  stack.defer(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  for (let i = 0; i + 1 < ranges.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const range = ranges[i]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const next = ranges[i + 1]!
    if (range.filepath !== next.filepath || range.end !== next.start) continue
    if (signal?.aborted) throw new Error("Aborted")

    const mark = range.end
    const silences = await findSilences(
      range.filepath,
      Math.max(range.start, mark - CHAPTER_CUT_WINDOW_SECONDS),
      Math.min(next.end, mark + CHAPTER_CUT_WINDOW_SECONDS),
      join(tmpDir, `${i}.wav`),
      signal,
      logger,
    )

    const { cut, reason } = chooseChapterCut(mark, silences)
    if (reason === "in-silence") continue
    if (reason === "no-silence-nearby") {
      logger?.warn(
        `Chapter mark at ${mark}s in ${range.filepath} falls in speech with no silence within ${CHAPTER_CUT_MAX_DISTANCE_SECONDS}s; cutting on the mark`,
      )
      continue
    }

    logger?.info(
      `Chapter mark at ${mark}s in ${range.filepath} falls in speech; moving the cut to ${cut}s`,
    )
    range.end = cut
    next.start = cut
  }
}

/**
 * Pick where to cut for a chapter mark, given the silences around it. The
 * mark is kept when it already sits in a silence; otherwise the cut moves to
 * the midpoint of the nearest silence, as long as one is within reach.
 */
export function chooseChapterCut(
  mark: number,
  silences: Range[],
  {
    maxDistance = CHAPTER_CUT_MAX_DISTANCE_SECONDS,
    minSilence = MIN_SILENCE_SECONDS,
  }: { maxDistance?: number; minSilence?: number } = {},
): { cut: number; reason: "in-silence" | "moved" | "no-silence-nearby" } {
  const candidates = silences.filter((s) => s.end - s.start >= minSilence)

  if (candidates.some((s) => s.start <= mark && mark <= s.end)) {
    return { cut: mark, reason: "in-silence" }
  }

  const distance = (s: Range) =>
    mark < s.start ? s.start - mark : mark - s.end

  let nearest: Range | null = null
  for (const silence of candidates) {
    if (!nearest || distance(silence) < distance(nearest)) nearest = silence
  }

  if (!nearest || distance(nearest) > maxDistance) {
    return { cut: mark, reason: "no-silence-nearby" }
  }

  return { cut: (nearest.start + nearest.end) / 2, reason: "moved" }
}

/**
 * The stretches of `input` between `from` and `to` (seconds) that the VAD
 * considers non-speech, in absolute seconds. Returns an empty array when
 * ffmpeg produces no audio for the window, which happens when it has
 * misjudged the track's duration near its end.
 */
async function findSilences(
  input: string,
  from: number,
  to: number,
  tmpFilepath: string,
  signal?: AbortSignal | null,
  logger?: Logger | null,
): Promise<Range[]> {
  await mkdir(dirname(tmpFilepath), { recursive: true })
  await splitFile(input, tmpFilepath, from, to, {}, signal, logger)

  const timeline = await detectVoiceActivity(tmpFilepath, {
    engine: "active-gate-og",
  })

  return timeline
    .filter((segment) => !segment.isSpeech)
    .map((segment) => ({
      start: segment.startTime + from,
      end: segment.endTime + from,
    }))
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

  const tmpDir = scratchPath(`storyteller-align-silence-${randomUUID()}`)

  await using stack = new AsyncDisposableStack()
  stack.defer(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  const ranges: Range[] = [{ start, end: duration + start }]

  for (let i = 0; i + 1 < duration / maxSeconds; i++) {
    if (signal?.aborted) throw new Error("Aborted")

    const approxCutPoint = start + maxSeconds * (i + 1)

    const silences = await findSilences(
      input,
      approxCutPoint - 120,
      approxCutPoint,
      join(tmpDir, i.toString(), `${rawFilename}.wav`),
      signal,
      logger,
    )

    // No audio (or no pause at all) in the search window: this only happens
    // at the very end of a track whose duration ffmpeg misjudged, so leave
    // the remainder in one range.
    if (silences.length === 0) {
      break
    }

    // The longest pause in the window is the likeliest sentence break
    const nearestLikelySentenceBreak = silences.reduce((acc, entry) =>
      acc.end - acc.start > entry.end - entry.start ? acc : entry,
    )

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
