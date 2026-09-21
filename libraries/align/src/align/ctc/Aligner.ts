import { readFile } from "node:fs/promises"
import {
  basename,
  dirname,
  parse,
  parse as autoParse,
  relative,
} from "node:path/posix"

import { enumerate, max } from "itertools"
import memoize from "memoize"
import { type Logger } from "pino"

import { Epub, type ManifestItem } from "@storyteller-platform/epub"
import {
  type Timing,
  createAggregator,
  createTiming,
  formatDuration,
} from "@storyteller-platform/ghost-story"
import { type Mapping } from "@storyteller-platform/mapping"
import { MediaType } from "@storyteller-platform/media-types"

import { type EmissionsReader } from "../../emit/fs.ts"
import { parseDom } from "../../markup/parseDom.ts"
import { segmentChapter } from "../../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../../markup/transform.ts"
import { readTrackSource } from "../../process/trackSource.ts"
import {
  READALOUD_STYLESHEET,
  type WrittenAudioChapter,
  writeAudioChapters,
} from "../audioChapters.ts"
import {
  type AudioRange,
  SentenceRange,
  type WordRange,
  enforceMonotonicAudioRanges,
  expandEmptyAudioRanges,
  expandEmptySentenceRanges,
  getChapterDuration,
} from "../getSentenceRanges.ts"
import {
  type Hole,
  LEGACY_RANGE_BEHAVIOUR,
  type RangeBehaviour,
  audioChapterSpine,
  collapseRanges,
  planAudioChapters,
} from "../holes.ts"
import {
  type SentenceLengths,
  interpolateSentenceRanges,
  slotKey,
} from "../interpolateSentenceRanges.ts"
import {
  type ReportChunkDebug,
  type ReportClassification,
  type ReportV4,
  emptyReport,
} from "../report-v4.ts"
import { type PendingSpineItem, buildAlignerReport } from "../reportBuilder.ts"
import { slugify, slugifiedWordRanges } from "../slugify.ts"

import {
  type EmissionTimings,
  boundaryOffsetFrames,
  framesToSeconds,
  secondsToFrames,
} from "./emissions.ts"
import {
  type AlignmentDecisions,
  type ExclusionOptions,
  NO_EXCLUSIONS,
  type SpineClassification,
  chapterAligned,
  classifySpine,
} from "./exclusions.ts"
import {
  type TokenAlignment,
  ctcForcedAlign,
  detectDroppedLabels,
} from "./forcedAlign.ts"
import {
  type ChapterHole,
  buildFragmentMaps,
  createMediaOverlay,
} from "./mediaOverlay.ts"
import { type AlignedChapter } from "./report.ts"
import { type Match, findCtcBoundaries } from "./search.ts"

const MAX_SEARCH_LENGTH = 40_000

function reportClassification(
  classification: SpineClassification,
): ReportClassification {
  const { zone, verdict, decidedBy, signals } = classification
  return { zone, verdict, decidedBy, signals }
}

function hrefStem(href: string): string {
  const path = href.split("#")[0] ?? href
  const name = path.split("/").pop() ?? path
  return name.replace(/\.[^.]+$/, "").toLowerCase()
}

function previewOf(sentences: { text: string }[]): string {
  return sentences
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

/**
 * Longest silence, in frames, tolerated between two consecutive characters of
 * one sentence before the characters beyond it are treated as misplaced.
 * Measured intra-sentence gaps top out around 100 frames (a 2 s dramatic
 * pause); deferred tails start at ~250.
 */
const MAX_INTRA_SENTENCE_GAP_FRAMES = 150

export interface AlignOptions {
  reportsPath?: string | null | undefined
  granularity?: "sentence" | "word" | null | undefined
  textRef?: "id-fragment" | "text-fragment" | null | undefined
  outFormat?: "epub" | "gnp" | null | undefined
  primaryLocale?: Intl.Locale | null | undefined
  logger?: Logger | null | undefined
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  gapSeconds?: number | null | undefined
  audioChapterSeconds?: number | null | undefined
  dropUnread?: boolean | null | undefined
  decisions?: AlignmentDecisions | null | undefined
  autoExclude?: boolean | null | undefined
}

/**
 * Audio files and emission files are paired by index, so both lists have to
 * cover the same recordings. A file present on only one side shifts every
 * pairing after it, which would silently align the rest of the book against
 * the wrong audio, so report the offending files instead of reading past the
 * end of the shorter list.
 */
export function checkAudioEmissionsPairing(
  audiofiles: string[],
  emissionFilepaths: string[],
) {
  if (audiofiles.length === emissionFilepaths.length) return

  const audioIsLonger = audiofiles.length > emissionFilepaths.length

  const unmatched = audioIsLonger
    ? audiofiles.slice(emissionFilepaths.length)
    : emissionFilepaths.slice(audiofiles.length)

  throw new Error(
    `Found ${audiofiles.length} audio files but ${emissionFilepaths.length} emission files. ` +
      `Each audio file needs its own emissions. Missing ${
        audioIsLonger ? "emissions for" : "audio file for"
      }:\n${unmatched.map((filepath) => `  ${filepath}`).join("\n")}`,
  )
}

/**
 * Narrow a chapter's emission frame range to the largest stretch of frames no
 * already aligned chapter has consumed.
 *
 * `matched` holds one consumption region per aligned chapter. Regions that
 * overlap or touch are merged first, because the gaps between them are found by
 * pairing consecutive endpoints: a nested region would otherwise pair an outer
 * region's end with a smaller start that precedes it, yielding a gap that runs
 * backwards and a narrowed range with `start` past `end`.
 */
export function narrowToAvailableBoundary(
  matched: [number, number][],
  boundary: { start: number; end: number },
) {
  const merged: [number, number][] = []
  for (const [start, end] of matched.toSorted((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1)
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end)
    } else {
      merged.push([start, end])
    }
  }

  const available: number[] = [-1, ...merged.flat(), Infinity]

  const withinBoundary: [number, number][] = []
  for (let i = 0; i < available.length - 1; i += 2) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [start, end] = [available[i]!, available[i + 1]!]
    if (
      (boundary.start <= start && boundary.end >= start) ||
      (boundary.start <= end && boundary.end >= end)
    ) {
      const narrowed: [number, number] = [
        Math.max(boundary.start, start + 1),
        Math.min(boundary.end, end - 1),
      ]
      // A boundary that ends exactly on a junction between two consumption
      // regions leaves nothing available on this side.
      if (narrowed[0] <= narrowed[1]) withinBoundary.push(narrowed)
    }
  }

  const largestBoundary = max(withinBoundary, ([start, end]) => end - start)

  if (!largestBoundary) return { start: boundary.start, end: boundary.end }

  return { start: largestBoundary[0], end: largestBoundary[1] }
}

/**
 * Splits a sentence's character alignments into runs separated by gaps longer
 * than `maxGapFrames` and returns the run with the most characters.
 *
 * Blanks over silence are free in the Viterbi path, so when a sentence's true
 * tail is faint (or the window runs past it into the next chapter's speech)
 * its last characters get deferred across the silence onto whatever matching
 * letters come next; the same happens in reverse at a window head. No narrated
 * sentence pauses that long, so the largest run is the sentence's real audio.
 */
export function findDominantRun(
  alignments: TokenAlignment[],
  startOffset: number,
  endOffset: number,
  maxGapFrames: number,
): [number, number] {
  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  let best: [number, number] = [startOffset, startOffset]
  let runStart = startOffset
  for (let k = startOffset + 1; k <= endOffset + 1; k++) {
    const gap =
      k <= endOffset
        ? alignments[k]!.startFrame - alignments[k - 1]!.endFrame
        : Infinity
    if (gap > maxGapFrames) {
      if (k - 1 - runStart > best[1] - best[0]) best = [runStart, k - 1]
      runStart = k
    }
  }
  return best
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

/**
 * Frames for a sentence whose dominant run is [runStart, runEnd]. The
 * characters outside the run were misplaced across a long gap, but they were
 * (probably) still narrated right next to the run (their true frames were just
 * too faint to win), so estimate the non-dominant runs by the dominant
 * run's frame rate.
 */
export function extendDominantRun(
  alignments: TokenAlignment[],
  startOffset: number,
  endOffset: number,
  runStart: number,
  runEnd: number,
): [number, number] {
  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  const runStartFrame = alignments[runStart]!.startFrame
  const runEndFrame = alignments[runEnd]!.endFrame
  const framesPerChar = (runEndFrame - runStartFrame) / (runEnd + 1 - runStart)

  let startFrame = runStartFrame
  if (runStart > startOffset) {
    const gap = runStartFrame - alignments[runStart - 1]!.endFrame
    startFrame -= Math.min(
      Math.round((runStart - startOffset) * framesPerChar),
      Math.max(gap - 1, 0),
    )
  }

  let endFrame = runEndFrame
  if (runEnd < endOffset) {
    const gap = alignments[runEnd + 1]!.startFrame - runEndFrame
    endFrame += Math.min(
      Math.round((endOffset - runEnd) * framesPerChar),
      Math.max(gap - 1, 0),
    )
  }

  return [startFrame, endFrame]
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

export class Aligner {
  private audiofileFrames: Map<string, [number, number]>

  private audiofileEmissionTimings: Map<string, EmissionTimings>

  /** Frames to add to a first or last character spike to reach the word's edge */
  private boundaryOffset: { start: number; end: number }

  private totalDuration = 0

  private alignedChapters: AlignedChapter[] = []

  private timing = createAggregator()

  private granularity: "sentence" | "word"

  private textRef: "id-fragment" | "text-fragment"

  private audioFileDurations: Record<string, number> = {}

  public report: ReportV4 = emptyReport("ctc")

  private pendingSpine = new Map<number, PendingSpineItem>()

  private chunkDebug: ReportChunkDebug[] = []

  private sentenceScores = new Map<string, number>()

  private droppedSlots = new Set<string>()

  private audioChapters: WrittenAudioChapter[] = []

  private titles = new Map<string, string>()

  constructor(
    public epub: Epub,
    private audiofiles: string[],
    private emissionsReader: EmissionsReader,
    granularity: "sentence" | "word" | null | undefined,
    textRef: "id-fragment" | "text-fragment" | null | undefined,
    private languageOverride?: Intl.Locale | null,
    private logger?: Logger | null,
    private abortSignal?: AbortSignal | null,
    private behaviour: RangeBehaviour = LEGACY_RANGE_BEHAVIOUR,
    private exclusions: ExclusionOptions = NO_EXCLUSIONS,
  ) {
    this.audiofileFrames = new Map()
    this.audiofileEmissionTimings = new Map()

    checkAudioEmissionsPairing(
      audiofiles,
      emissionsReader.frameMap.map(([filepath]) => filepath),
    )

    for (const [i, audiofile] of enumerate(audiofiles)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [, framesStart, framesEnd] = emissionsReader.frameMap[i]!
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const timings = emissionsReader.timings[i]!

      const length = framesEnd - framesStart
      this.audiofileFrames.set(audiofile, [framesStart, framesEnd])
      this.audioFileDurations[audiofile] = framesToSeconds(length, timings)
      this.audiofileEmissionTimings.set(audiofile, timings)
    }

    const [firstTimings] = emissionsReader.timings
    this.boundaryOffset = firstTimings
      ? boundaryOffsetFrames(firstTimings)
      : { start: 0, end: 0 }

    const masks: [number, number][] = []
    for (const [audiofile, [start, end]] of this.excludedAudio()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [fileStart, fileEnd] = this.audiofileFrames.get(audiofile)!
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const timings = this.audiofileEmissionTimings.get(audiofile)!
      masks.push([
        Math.max(fileStart, fileStart + secondsToFrames(start, timings)),
        Math.min(fileEnd, fileStart + secondsToFrames(end, timings)),
      ])
    }
    if (masks.length > 0) {
      this.emissionsReader = emissionsReader.withMasks(masks)
    }

    this.getChapterSentences = memoize(this.getChapterSentences.bind(this))

    this.granularity = granularity ?? "sentence"

    this.textRef = textRef ?? "id-fragment"
  }

  private excludedAudio(): [string, [number, number]][] {
    const byName = new Map(
      this.audiofiles.map((audiofile) => [basename(audiofile), audiofile]),
    )
    const ranges: [string, [number, number]][] = []
    for (const exclusion of this.exclusions.decisions.audio) {
      const audiofile = byName.get(exclusion.track)
      if (!audiofile) continue
      const duration = this.audioFileDurations[audiofile] ?? 0
      const start = Math.max(0, exclusion.start ?? 0)
      const end = Math.min(duration, exclusion.end ?? duration)
      if (end <= start) continue
      ranges.push([audiofile, [start, end]])
    }
    return ranges
  }

  private async getChapterSentences(chapterId: string) {
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)

    const original = parseDom(Epub.getXhtmlBody(chapterXml))

    const inlined = inlineFootnotes(original)

    const lifted = liftText(inlined.root)

    const segmentation = await segmentChapter(lifted.result, {
      primaryLocale: this.languageOverride ?? (await this.epub.getLanguage()),
    })

    return segmentation.filter((s) => s.text.match(/\S/))
  }

  private async writeAlignedChapter(
    alignedChapter: AlignedChapter,
    holes: ChapterHole[] = [],
  ) {
    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")

    const { chapter, sentenceRanges, wordRanges, xml } = alignedChapter
    const sentences = await this.getChapterSentences(chapter.id)

    const {
      sentenceIdToBlockFragment,
      sentenceIdToFragment,
      wordIdToFragment,
      wordRangeMap,
    } = buildFragmentMaps(
      sentenceRanges,
      wordRanges,
      sentences,
      locale,
      this.textRef,
      this.granularity,
    )

    await this.addAudio([
      ...sentenceRanges.flatMap((range) => range.audiofiles),
      ...holes.map(({ audiofile }) => audiofile),
    ])

    const mediaOverlayId = await this.addMediaOverlay(
      chapter,
      sentenceRanges,
      wordRangeMap,
      sentenceIdToBlockFragment,
      sentenceIdToFragment,
      wordIdToFragment,
      holes,
    )

    await this.epub.updateManifestItem(chapter.id, {
      ...chapter,
      mediaOverlay: mediaOverlayId,
    })

    await this.epub.writeXhtmlItemContents(chapter.id, xml)

    const chapterDuration = getChapterDuration(
      [
        ...sentenceRanges.flatMap((range) => range.audioRanges),
        ...holes,
      ].toSorted(
        (a, b) =>
          this.audiofiles.indexOf(a.audiofile) -
            this.audiofiles.indexOf(b.audiofile) || a.start - b.start,
      ),
    )

    await this.epub.addMetadata({
      type: "meta",
      properties: {
        property: "media:duration",
        refines: `#${mediaOverlayId}`,
      },
      value: Epub.formatSmilDuration(chapterDuration),
    })
  }

  private async addAudio(files: string[]) {
    const audiofiles = Array.from(new Set(files))

    await Promise.all(
      audiofiles.map(async (audiofile) => {
        this.abortSignal?.throwIfAborted()

        const { name, base } = autoParse(audiofile)

        const id = `audio_${name}`

        // Make sure this file hasn't already been added
        // from a previous chapter
        const manifest = await this.epub.getManifest()
        if (id in manifest) return

        const epubAudioFilename = `Audio/${base}`
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const duration = this.audioFileDurations[audiofile]!
        this.totalDuration += duration

        const audio = await readFile(audiofile)

        const mediaType = MediaType.fromPath(base)?.mime
        await this.epub.addManifestItem(
          {
            id,
            href: epubAudioFilename,
            mediaType,
          },
          audio,
        )
      }),
    )
  }

  private async addMediaOverlay(
    chapter: ManifestItem,
    sentenceRanges: SentenceRange[],
    wordRangeMap: Map<number, WordRange[]>,
    sentenceIdToBlockFragment: Map<number, string> | null,
    sentenceIdToFragment: Map<number, string>,
    wordIdToFragment: Map<number, Map<number, string>>,
    holes: ChapterHole[],
  ) {
    const { name: chapterStem } = parse(chapter.href)

    const mediaOverlayId = `${chapter.id}_overlay`
    await this.epub.addManifestItem(
      {
        id: mediaOverlayId,
        href: `MediaOverlays/${chapterStem}.smil`,
        mediaType: "application/smil+xml",
      },
      createMediaOverlay(
        chapter,
        this.granularity,
        sentenceRanges,
        wordRangeMap,
        sentenceIdToBlockFragment,
        sentenceIdToFragment,
        wordIdToFragment,
        holes,
      ),
      "xml",
    )

    return mediaOverlayId
  }

  private markSpine(item: PendingSpineItem) {
    this.pendingSpine.set(item.index, item)
  }

  private async getSentenceRanges(
    chapterId: string,
    slugifiedChapter: string,
    sentenceStarts: [number, number][],
    wordStarts: [number, number][][],
    sentenceIndexOffset: number,
    emissionsStart: number,
    emissionsEnd: number,
    anchors: Match[],
    paddedChapterBoundaries: [number, number],
    unpaddedChapterBoundaries: [number, number],
    timing: Timing,
  ): Promise<{
    score: number
    sentenceRanges: SentenceRange[]
    wordRanges: WordRange[][]
    alignedEmissionsStart: number
    alignedEmissionsEnd: number
    firstFoundSentence: number
    lastFoundSentence: number
    droppedSentences: number[]
    viterbiCells: number
    segments: number
  }> {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    // TODO: We should probably compute these with the emissionTimings
    const SENTENCE_PAD = 25

    const windowAnchors = anchors
      .filter(
        (a) =>
          a.position > emissionsStart &&
          a.position < emissionsEnd &&
          a.position - emissionsStart >= a.offset &&
          emissionsEnd - a.position >= slugifiedChapter.length - a.offset,
      )
      .map((a) => ({ ...a, position: a.position - emissionsStart }))

    const frames = await timing.timeAsync("read emissions", () =>
      this.emissionsReader.readFrames(emissionsStart, emissionsEnd),
    )

    const segmentOffsets = [
      0,
      ...windowAnchors.map((a) => a.offset),
      slugifiedChapter.length,
    ]
    const segmentPositions = [
      0,
      ...windowAnchors.map((a) => a.position),
      frames.frames,
    ]
    let viterbiCells = 0
    for (let i = 1; i < segmentOffsets.length; i++) {
      viterbiCells +=
        (segmentPositions[i]! - segmentPositions[i - 1]!) *
        (2 * (segmentOffsets[i]! - segmentOffsets[i - 1]!) + 1)
    }

    const droppedSentences = new Set<number>()
    const alignments = timing.time("viterbi", () =>
      ctcForcedAlign(
        slugifiedChapter,
        frames,
        windowAnchors,
        this.emissionsReader.vocab,
        this.emissionsReader.blankId,
        (labelOffset, alignments) => {
          const dropped: [number, number][] = []
          for (const [i, [s, e]] of enumerate(sentenceStarts)) {
            if (
              s >= labelOffset &&
              e < labelOffset + alignments.length &&
              detectDroppedLabels(alignments, s - labelOffset, e - labelOffset)
            ) {
              if (
                e >= paddedChapterBoundaries[0] &&
                s < paddedChapterBoundaries[1]
              ) {
                droppedSentences.add(i)
              }
              dropped.push([s, e])
            }
          }
          return dropped
        },
      ),
    )

    const finiteScores = alignments.filter(({ score }) => score !== -Infinity)

    const score =
      finiteScores.length > 0
        ? (finiteScores.reduce((acc, { score }) => acc + Math.exp(score), 0) /
            finiteScores.length) *
          100
        : 0

    const {
      sentenceRanges,
      skippedSentences,
      sentenceFrameSpans,
      firstFoundSentence,
      lastFoundSentence,
      firstConfirmedSentence,
      firstConfirmedStartFrame,
      lastConfirmedEndFrame,
    } = timing.time("ranges", () =>
      this.buildSentenceRanges(
        alignments,
        sentenceStarts,
        sentenceIndexOffset,
        emissionsStart,
        SENTENCE_PAD,
        chapterId,
        paddedChapterBoundaries,
        unpaddedChapterBoundaries,
        droppedSentences,
      ),
    )

    const droppedIds = [...droppedSentences]
      .toSorted((a, b) => a - b)
      .map((i) => sentenceIndexOffset + i)

    const wordRanges = timing.time("ranges", () =>
      this.buildWordRanges(
        alignments,
        wordStarts,
        sentenceIndexOffset,
        emissionsStart,
        skippedSentences,
        sentenceFrameSpans,
        chapterId,
      ),
    )

    if (
      firstFoundSentence === null ||
      firstConfirmedSentence === null ||
      firstConfirmedStartFrame === null
    ) {
      return {
        score,
        sentenceRanges: [],
        wordRanges: [],
        alignedEmissionsStart: emissionsStart,
        alignedEmissionsEnd: emissionsStart,
        firstFoundSentence: sentenceIndexOffset,
        lastFoundSentence: sentenceIndexOffset,
        droppedSentences: droppedIds,
        viterbiCells,
        segments: windowAnchors.length + 1,
      }
    }

    return {
      score,
      sentenceRanges,
      wordRanges,
      droppedSentences: droppedIds,
      alignedEmissionsStart: firstConfirmedStartFrame + emissionsStart,
      alignedEmissionsEnd: lastConfirmedEndFrame + emissionsStart,
      firstFoundSentence: sentenceIndexOffset + firstFoundSentence,
      lastFoundSentence: sentenceIndexOffset + lastFoundSentence,
      viterbiCells,
      segments: windowAnchors.length + 1,
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  private buildSentenceRanges(
    alignments: TokenAlignment[],
    sentenceStarts: [number, number][],
    sentenceIndexOffset: number,
    emissionsStart: number,
    padFrames: number,
    chapterId: string,
    paddedChapterBoundaries: [number, number],
    unpaddedChapterBoundaries: [number, number],
    droppedSentences: Set<number>,
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const sentenceRanges: SentenceRange[] = []
    const skippedSentences = new Set<number>()
    /** Window-relative [start, end] frames of each kept sentence's audio */
    const sentenceFrameSpans = new Map<number, [number, number]>()

    let firstFoundSentence: null | number = null
    let lastFoundSentence = 0
    let lastFoundSentenceEnd = 0

    let firstConfirmedSentence: null | number = null
    let lastConfirmedSentence = 0
    let firstConfirmedStartFrame: null | number = null
    let lastConfirmedEndFrame = 0

    for (const [i, [startOffset, endOffset]] of enumerate(sentenceStarts)) {
      if (endOffset < startOffset) {
        skippedSentences.add(i)
        continue
      }
      if (!alignments[startOffset] || !alignments[endOffset]) {
        skippedSentences.add(i)
        continue
      }

      const withinEvidence =
        endOffset >= paddedChapterBoundaries[0] &&
        startOffset < paddedChapterBoundaries[1]

      const sentenceLength = endOffset + 1 - startOffset

      const framesPerChar =
        (alignments[endOffset].endFrame - alignments[startOffset].startFrame) /
        sentenceLength

      // Characters deferred across a long silence belong to whatever speech
      // they landed on, not to this sentence; judge and time it by its
      // dominant run only.
      const [runStart, runEnd] = findDominantRun(
        alignments,
        startOffset,
        endOffset,
        MAX_INTRA_SENTENCE_GAP_FRAMES,
      )
      const runLength = runEnd + 1 - runStart

      if (runLength < sentenceLength / 2) {
        skippedSentences.add(i)
        continue
      }

      const goodChars = alignments
        .slice(runStart, runEnd + 1)
        .reduce((acc, a) => acc + (a.score > -4 ? 1 : 0), 0)

      if (goodChars / runLength < 0.5) {
        skippedSentences.add(i)
        if (withinEvidence && sentenceLength > 8 && framesPerChar < 2) {
          droppedSentences.add(i)
        }
        continue
      }

      const runFramesPerChar =
        (alignments[runEnd]!.endFrame - alignments[runStart]!.startFrame) /
        runLength

      if (runLength > 8 && (runFramesPerChar < 2 || runFramesPerChar > 15)) {
        skippedSentences.add(i)
        continue
      }

      const [runStartFrame, runEndFrame] = extendDominantRun(
        alignments,
        startOffset,
        endOffset,
        runStart,
        runEnd,
      )
      const startFrame = this.refineStartFrame(
        runStartFrame + this.boundaryOffset.start,
        lastFoundSentenceEnd,
        padFrames,
        emissionsStart,
      )
      const endFrame = Math.max(
        startFrame,
        runEndFrame + this.boundaryOffset.end,
      )

      firstFoundSentence ??= i
      lastFoundSentence = i
      lastFoundSentenceEnd = endFrame
      sentenceFrameSpans.set(i, [startFrame, endFrame])

      const sentenceScores = alignments
        .slice(runStart, runEnd + 1)
        .map((a) => a.score)
        .filter((score) => score !== -Infinity)
      if (sentenceScores.length > 0) {
        const mean =
          sentenceScores.reduce((acc, score) => acc + score, 0) /
          sentenceScores.length
        this.sentenceScores.set(
          slotKey({ chapterId, id: sentenceIndexOffset + i }),
          Math.min(Math.max((mean + 10) * 10, 0), 100),
        )
      }

      sentenceRanges.push(
        new SentenceRange(
          sentenceIndexOffset + i,
          chapterId,
          this.framesToAudioRanges(startFrame, endFrame, emissionsStart),
        ),
      )

      if (
        startOffset <= unpaddedChapterBoundaries[1] &&
        endOffset >= unpaddedChapterBoundaries[0]
      ) {
        firstConfirmedSentence ??= i
        lastConfirmedSentence = i
        firstConfirmedStartFrame ??= startFrame
        lastConfirmedEndFrame = endFrame
      }
    }

    return {
      sentenceRanges,
      skippedSentences,
      sentenceFrameSpans,
      firstFoundSentence,
      lastFoundSentence,
      lastFoundSentenceEnd,
      firstConfirmedSentence,
      lastConfirmedSentence,
      firstConfirmedStartFrame,
      lastConfirmedEndFrame,
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  private buildWordRanges(
    alignments: TokenAlignment[],
    wordStarts: [number, number][][],
    sentenceIndexOffset: number,
    emissionsStart: number,
    skippedSentences: Set<number>,
    sentenceFrameSpans: Map<number, [number, number]>,
    chapterId: string,
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const wordRanges: WordRange[][] = []
    let lastFoundWordEnd = 0

    for (const [i, ws] of enumerate(wordStarts)) {
      if (skippedSentences.has(i)) continue
      const span = sentenceFrameSpans.get(i)
      if (!span) continue
      const [spanStart, spanEnd] = span

      const ranges: WordRange[] = []
      for (const [j, [startOffset, endOffset]] of enumerate(ws)) {
        if (endOffset < startOffset) continue

        const goodChars = alignments
          .slice(startOffset, endOffset + 1)
          .reduce((acc, a) => acc + (a.score > -4 ? 1 : 0), 0)

        if (goodChars / (endOffset + 1 - startOffset) < 0.5) {
          continue
        }

        // Words the sentence's dominant run excluded collapse onto its edge
        const clamp = (frame: number) =>
          Math.min(Math.max(frame, spanStart), spanEnd)

        const startFrame = this.refineStartFrame(
          clamp(
            alignments[startOffset]!.startFrame + this.boundaryOffset.start,
          ),
          lastFoundWordEnd,
          0,
          emissionsStart,
        )
        const endFrame = Math.max(
          startFrame,
          clamp(alignments[endOffset]!.endFrame + this.boundaryOffset.end),
        )

        lastFoundWordEnd = endFrame

        // Word ranges stay single-clip: a word cut across two files keeps the
        // part in the file it starts in
        const [range] = this.framesToAudioRanges(
          startFrame,
          endFrame,
          emissionsStart,
        )

        ranges.push({
          id: j,
          sentenceId: sentenceIndexOffset + i,
          chapterId,
          ...range!,
          state: "matched",
        })
      }
      if (ranges.length) wordRanges.push(ranges)
    }

    return wordRanges
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  /**
   * Convert a window-relative frame span to clip positions, one clip per
   * audio file the span crosses.
   */
  private framesToAudioRanges(
    startFrame: number,
    endFrame: number,
    emissionsStart: number,
  ): AudioRange[] {
    const globalStart = startFrame + emissionsStart
    const globalEnd = Math.max(globalStart, endFrame + emissionsStart)

    const ranges: AudioRange[] = []
    for (const [audiofile, [fileStart, fileEnd]] of this.audiofileFrames) {
      if (fileEnd <= globalStart) continue
      if (fileStart > globalEnd) break
      const start = Math.max(globalStart, fileStart)
      const end = Math.min(globalEnd, fileEnd)
      // A span ending exactly on a file boundary contributes nothing to the
      // next file
      if (end === start && ranges.length > 0) break
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const timings = this.audiofileEmissionTimings.get(audiofile)!
      ranges.push({
        audiofile,
        start: framesToSeconds(start - fileStart, timings),
        end: framesToSeconds(end - fileStart, timings),
      })
    }

    if (ranges.length === 0) {
      throw new Error(
        `Frames ${globalStart}-${globalEnd} are beyond the end of the emissions`,
      )
    }

    return ranges
  }

  private frameToAudioPosition(
    frame: number,
    emissionsStart: number,
  ): { position: number; audiofile: string } {
    const globalFrame = frame + emissionsStart

    for (const [audiofile, [fileStart, fileEnd]] of this.audiofileFrames) {
      if (globalFrame < fileEnd) {
        return {
          position: framesToSeconds(
            globalFrame - fileStart,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.audiofileEmissionTimings.get(audiofile)!,
          ),
          audiofile,
        }
      }
    }

    throw new Error(`Frame ${globalFrame} is beyond the end of the emissions`)
  }

  private refineStartFrame(
    startFrame: number,
    prevEndFrame: number,
    padFrames: number,
    emissionsStart: number,
  ) {
    const { audiofile } = this.frameToAudioPosition(startFrame, emissionsStart)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [start] = this.audiofileFrames.get(audiofile)!
    const windowFloor = start - emissionsStart

    return Math.max(prevEndFrame + 1, startFrame - padFrames, windowFloor)
  }

  private async alignChapter(
    spineIndex: number,
    chapterId: string,
    chunk: number,
    sentenceIndexOffset: number,
    slugifiedChapter: string,
    sentenceStarts: [number, number][],
    wordStarts: [number, number][][],
    emissionsStart: number,
    emissionsEnd: number,
    anchors: Match[],
    paddedChapterBoundaries: [number, number],
    unpaddedChapterBoundaries: [number, number],
    timing: Timing,
  ) {
    const manifest = await this.epub.getManifest()
    const chapter = manifest[chapterId]
    if (!chapter)
      throw new Error(
        `Failed to align chapter: could not find chapter with id ${chapterId} in manifest`,
      )
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)

    const {
      score,
      sentenceRanges,
      wordRanges,
      alignedEmissionsStart,
      alignedEmissionsEnd,
      firstFoundSentence,
      lastFoundSentence,
      droppedSentences,
      viterbiCells,
      segments,
    } = await this.getSentenceRanges(
      chapterId,
      slugifiedChapter,
      sentenceStarts,
      wordStarts,
      sentenceIndexOffset,
      emissionsStart,
      emissionsEnd,
      anchors,
      paddedChapterBoundaries,
      unpaddedChapterBoundaries,
      timing,
    )

    for (const id of droppedSentences) {
      this.droppedSlots.add(slotKey({ chapterId, id }))
    }

    const storytellerStylesheetUrl = relative(
      dirname(chapter.href),
      "Styles/storyteller-readaloud.css",
    )

    Epub.addLinkToXhtmlHead(chapterXml, {
      rel: "stylesheet",
      href: storytellerStylesheetUrl,
      type: "text/css",
    })

    this.alignedChapters.push({
      chapter,
      chunk,
      xml: chapterXml,
      sentenceRanges,
      wordRanges,
      startOffset: alignedEmissionsStart,
      endOffset: alignedEmissionsEnd,
    })

    this.chunkDebug.push({
      spine: spineIndex,
      chunk,
      firstSentence: firstFoundSentence,
      lastSentence: lastFoundSentence,
      emissionsStart: alignedEmissionsStart,
      emissionsEnd: alignedEmissionsEnd,
      score,
    })

    return {
      lastSentenceRange: sentenceRanges.at(-1) ?? null,
      alignedEmissionsEnd,
      viterbiCells,
      segments,
    }
  }

  private getMatchedBoundaries() {
    return this.alignedChapters
      .toSorted((a, b) => a.startOffset - b.startOffset)
      .map<[number, number]>(({ startOffset, endOffset }) => [
        startOffset,
        endOffset,
      ])
  }

  async alignBook(onProgress?: ((progress: number) => void) | null) {
    const { locale } = await this.prepareAlignment()
    await this.processSpine(onProgress, locale)
    await this.finalizeAlignment()
    return this.timing
  }

  private async prepareAlignment() {
    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")

    this.timing.setMetadata("language", locale.toString())
    this.timing.setMetadata("granularity", this.granularity)

    const toc = await this.epub.getTableOfContents({ resolveToRoot: true })
    const visit = (
      items: { href?: string; title: string; children?: unknown }[],
    ) => {
      for (const item of items) {
        if (item.href) {
          const key = hrefStem(item.href)
          if (!this.titles.has(key)) this.titles.set(key, item.title)
        }
        if (Array.isArray(item.children)) {
          visit(item.children as typeof items)
        }
      }
    }
    visit(toc?.children ?? [])

    return { locale }
  }

  private async processSpine(
    onProgress: ((progress: number) => void) | null | undefined,
    locale: Intl.Locale,
  ) {
    const spine = await this.epub.getSpineItems()
    const classifications = await classifySpine(this.epub, { locale })

    for (let index = 0; index < spine.length; index++) {
      this.abortSignal?.throwIfAborted()
      onProgress?.(index / spine.length)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const classification = classifications[index]!

      this.logger?.info(
        `Aligning epub item #${index} : ${basename(spineItem.href)}`,
      )

      await this.processSpineItem(index, spineItem, classification, locale)
    }

    const stats = this.timing.getStats()
    const byPhase = [...stats.phaseStats.entries()]
      .sort((a, b) => b[1].totalMs - a[1].totalMs)
      .map(([name, phase]) => `${name} ${formatDuration(phase.totalMs)}`)
      .join(", ")
    this.logger?.info(
      `Aligned ${stats.count} chapters in ${formatDuration(stats.wallClockMs)}: ${byPhase}`,
    )
  }

  private async processSpineItem(
    index: number,
    spineItem: { id: string; href: string },
    classification: SpineClassification,
    locale: Intl.Locale,
  ) {
    const timing = createTiming()

    const chapterId = spineItem.id
    const title = this.titles.get(hrefStem(spineItem.href)) ?? null
    const decision = this.exclusions.decisions.chapters[spineItem.href] ?? null
    const reported = reportClassification(classification)

    if (
      !chapterAligned(classification, decision, this.exclusions.autoExclude)
    ) {
      this.logger?.info(
        `Chapter #${index} is excluded (${decision ?? classification.decidedBy?.source}); skipping`,
      )
      this.markSpine({
        index,
        href: spineItem.href,
        chapterId,
        title,
        status: "excluded",
        classification: reported,
        decision,
        sentenceCount: 0,
        preview: null,
      })
      return []
    }

    const chapterSentences = await timing.timeAsync("sentences", () =>
      this.getChapterSentences(chapterId),
    )

    const slugifiedChapterSentences: string[] = []
    const chapterMappings: Mapping[] = []
    let slugifiedChapterLength = 0

    timing.start("slugify")
    for (const chapterSentence of chapterSentences) {
      const { result, mapping } = await slugify(
        chapterSentence.text,
        locale,
        "",
        false,
        this.emissionsReader.vocab,
      )
      slugifiedChapterSentences.push(result)
      slugifiedChapterLength += result.length
      chapterMappings.push(mapping)
    }
    timing.end("slugify")

    if (chapterSentences.length === 0 || slugifiedChapterLength === 0) {
      this.logger?.info(`Chapter #${index} has no text; skipping`)
      const noText = {
        source: "no-text",
        value: "",
        verdict: "exclude",
      } as const
      this.markSpine({
        index,
        href: spineItem.href,
        chapterId,
        title,
        status: "excluded",
        classification: {
          ...reported,
          verdict: "exclude",
          decidedBy: noText,
          signals: reported.signals.some((s) => s.source === "no-text")
            ? reported.signals
            : [...reported.signals, noText],
        },
        decision,
        sentenceCount: 0,
        preview: null,
      })
      return []
    }

    if (
      chapterSentences.length < 2 &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chapterSentences[0]!.words.length < 4
    ) {
      this.logger?.info(`Chapter #${index} is fewer than four words; skipping`)
      this.markSpine({
        index,
        href: spineItem.href,
        chapterId,
        title,
        status: "too-short",
        classification: reported,
        decision,
        sentenceCount: chapterSentences.length,
        preview: previewOf(chapterSentences),
      })
      return []
    }

    const boundaries = await timing.timeAsync("search", () =>
      findCtcBoundaries(
        slugifiedChapterSentences.join(""),
        this.emissionsReader,
        this.getMatchedBoundaries(),
      ),
    )

    const evidenceRange = boundaries?.evidenceRange
    const matchedRange = boundaries?.matchedRange

    const chunkCount = Math.ceil(slugifiedChapterLength / MAX_SEARCH_LENGTH)
    const chunkLength = Math.ceil(slugifiedChapterLength / chunkCount)

    const chunks: { firstSentence: number; sentences: string[] }[] = [
      { firstSentence: 0, sentences: [] },
    ]
    let c = 0
    for (const [i, s] of enumerate(slugifiedChapterSentences)) {
      if (
        c >= chunkLength * chunks.length &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chunks.at(-1)!.sentences.length > 0
      ) {
        chunks.push({ firstSentence: i, sentences: [] })
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chunks.at(-1)!.sentences.push(s)
      c += s.length
    }

    if (chunks.length > 1) {
      this.logger?.info(
        `Chapter #${index} is ${slugifiedChapterLength} chars; aligning in ${chunks.length} chunks`,
      )
    }

    const results: {
      lastSentenceRange: SentenceRange | null
      alignedEmissionsEnd: number
      viterbiCells: number
      segments: number
    }[] = []

    const firstAlignedChapterIndex = this.alignedChapters.length

    for (const [
      chunkIndex,
      { firstSentence, sentences: chunkSentences },
    ] of enumerate(chunks)) {
      this.abortSignal?.throwIfAborted()
      let pos = 0
      const slugifiedChapterRanges: [number, number][] = []
      for (const sent of chunkSentences) {
        slugifiedChapterRanges.push([pos, pos + sent.length - 1])
        pos += sent.length
      }

      const slugifiedWordStarts = chunkSentences.map((_, i) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const sent = chapterSentences[firstSentence + i]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const mapping = chapterMappings[firstSentence + i]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [slugStart] = slugifiedChapterRanges[i]!

        return slugifiedWordRanges(
          sent.words.entries,
          mapping,
          sent.charRange.start,
          slugStart,
        )
      })

      const chunkString = chunkSentences.join("")

      const boundaries = await timing.timeAsync("search", () =>
        findCtcBoundaries(
          chunkString,
          this.emissionsReader,
          this.getMatchedBoundaries(),
        ),
      )

      if (!boundaries) {
        this.logger?.info(
          `Could not find chapter #${index} in the transcripton`,
        )
        continue
      }

      const { start, end } = narrowToAvailableBoundary(
        this.getMatchedBoundaries(),
        boundaries,
      )
      if (start === end) {
        this.logger?.info(
          `Could not find chapter #${index} in the transcripton`,
        )
        continue
      }

      const lastChunkSlugStart = slugifiedChapterLength - chunkString.length

      const chunkEvidenceHead =
        chunkIndex === 0 && evidenceRange
          ? Math.min(evidenceRange[0], boundaries.evidenceRange[0])
          : boundaries.evidenceRange[0]
      const chunkEvidenceTail =
        chunkIndex === chunks.length - 1 && evidenceRange
          ? Math.max(
              evidenceRange[1] - lastChunkSlugStart,
              boundaries.evidenceRange[1],
            )
          : boundaries.evidenceRange[1]

      const chunkMatchedHead =
        chunkIndex === 0 && matchedRange
          ? Math.min(matchedRange[0], boundaries.matchedRange[0])
          : boundaries.matchedRange[0]
      const chunkMatchedTail =
        chunkIndex === chunks.length - 1 && matchedRange
          ? Math.max(
              matchedRange[1] - lastChunkSlugStart,
              boundaries.matchedRange[1],
            )
          : boundaries.matchedRange[1]

      const result = await this.alignChapter(
        index,
        chapterId,
        chunkIndex,
        firstSentence,
        chunkString,
        slugifiedChapterRanges,
        slugifiedWordStarts,
        start,
        end,
        boundaries.anchors,
        [chunkEvidenceHead, chunkEvidenceTail],
        [chunkMatchedHead, chunkMatchedTail],
        timing,
      )

      results.push(result)
    }

    const chunkEntries = this.alignedChapters.slice(firstAlignedChapterIndex)

    const elapsed = timing.getElapsedMs()
    const emissionTimings = this.emissionsReader.timings[0]
    const audioSeconds = emissionTimings
      ? framesToSeconds(
          chunkEntries.reduce((acc, e) => acc + e.endOffset - e.startOffset, 0),
          emissionTimings,
        )
      : 0
    const segments = results.reduce((acc, r) => acc + r.segments, 0)
    const cells = results.reduce((acc, r) => acc + r.viterbiCells, 0)
    const phases = timing
      .summary()
      .phases.map(({ name, duration }) =>
        name === "viterbi"
          ? `viterbi ${formatDuration(duration)} (${segments} segments, ${Math.round(cells / 1e6)}M cells)`
          : `${name} ${formatDuration(duration)}`,
      )
      .join(", ")
    this.logger?.info(
      `Chapter #${index} aligned ${slugifiedChapterLength} chars to ${Math.round(audioSeconds / 60)} min of audio in ${formatDuration(elapsed)} (${Math.round(audioSeconds / (elapsed / 1000))}x realtime): ${phases}`,
    )
    this.timing.add(timing.summary())
    this.markSpine({
      index,
      href: spineItem.href,
      chapterId,
      title,
      status: chunkEntries.length > 0 ? "aligned" : "not-found",
      classification: reported,
      decision,
      sentenceCount: chapterSentences.length,
      preview:
        chunkEntries.length > 0
          ? null
          : previewOf([
              ...chapterSentences.slice(0, 3),
              ...chapterSentences.slice(-3),
            ]),
    })
    if (chunkEntries.length > 1) {
      const claimed = chunkEntries.filter((e) => e.sentenceRanges.length > 0)
      const offsetSources = claimed.length > 0 ? claimed : chunkEntries
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const first = chunkEntries[0]!
      this.alignedChapters.splice(
        firstAlignedChapterIndex,
        chunkEntries.length,
        {
          chapter: first.chapter,
          chunk: 0,
          xml: first.xml,
          sentenceRanges: chunkEntries.flatMap((e) => e.sentenceRanges),
          wordRanges: chunkEntries.flatMap((e) => e.wordRanges),
          startOffset: Math.min(...offsetSources.map((e) => e.startOffset)),
          endOffset: Math.max(...offsetSources.map((e) => e.endOffset)),
        },
      )
    }

    return results
  }

  private async finalizeAlignment() {
    const audioOrderedChapters = this.alignedChapters.toSorted((a, b) => {
      const firstRangeA = a.sentenceRanges[0]
      const firstRangeB = b.sentenceRanges[0]
      if (!firstRangeA) return 1
      if (!firstRangeB) return -1
      const firstAudiofileIndexA = this.audiofiles.indexOf(
        firstRangeA.first.audiofile,
      )
      const firstAudiofileIndexB = this.audiofiles.indexOf(
        firstRangeB.first.audiofile,
      )
      if (firstAudiofileIndexA === firstAudiofileIndexB) {
        return firstRangeA.first.start - firstRangeB.first.start
      }
      return firstAudiofileIndexA - firstAudiofileIndexB
    })

    const sentenceRanges: SentenceRange[] = []
    const chapterSentenceCounts: Record<string, number> = {}
    const sentenceLengths: SentenceLengths = {}

    for (const alignedChapter of audioOrderedChapters) {
      sentenceRanges.push(...alignedChapter.sentenceRanges)

      const sentences = await this.getChapterSentences(
        alignedChapter.chapter.id,
      )
      chapterSentenceCounts[alignedChapter.chapter.id] = sentences.length

      for (const [id, sentence] of enumerate(sentences)) {
        sentenceLengths[slotKey({ chapterId: alignedChapter.chapter.id, id })] =
          sentence.text.length
      }
    }

    const interpolated = interpolateSentenceRanges(
      enforceMonotonicAudioRanges(
        sentenceRanges,
        this.audiofiles,
        this.audioFileDurations,
      ),
      chapterSentenceCounts,
      this.audioFileDurations,
      sentenceLengths,
      {
        droppedSlots: this.droppedSlots,
        dropUnread: this.behaviour.dropUnread,
      },
    )

    const expanded = expandEmptySentenceRanges(interpolated)
    const { ranges: collapsed, holes } = collapseRanges(
      expanded,
      this.audiofiles,
      this.audioFileDurations,
      this.behaviour,
    )

    const sources = new Map(
      await Promise.all(
        this.audiofiles.map(
          async (file) => [file, await readTrackSource(file)] as const,
        ),
      ),
    )
    const spine = audioChapterSpine(this.pendingSpine.values())
    const { chapters, remaining } = planAudioChapters(
      holes,
      this.behaviour,
      this.audioFileDurations,
      {
        trackTitle: (file) => sources.get(file)?.title ?? null,
        chapterTitle: spine.chapterTitle,
        excludedBetween: spine.excludedBetween,
      },
    )

    const holesByChapter = new Map<string, ChapterHole[]>()
    for (const hole of remaining) {
      const list = holesByChapter.get(hole.anchor.chapterId) ?? []
      list.push({
        sentenceId: hole.anchor.sentenceId,
        position: hole.anchor.position,
        audiofile: hole.audiofile,
        start: hole.start,
        end: hole.end,
      })
      holesByChapter.set(hole.anchor.chapterId, list)
    }

    let collapsedStart = 0
    for (const alignedChapter of audioOrderedChapters) {
      const sentences = await this.getChapterSentences(
        alignedChapter.chapter.id,
      )
      const finalSentenceRanges = collapsed.slice(
        collapsedStart,
        collapsedStart + sentences.length,
      )
      alignedChapter.sentenceRanges = finalSentenceRanges
      for (const [i, wordRanges] of enumerate(alignedChapter.wordRanges)) {
        alignedChapter.wordRanges[i] = expandEmptyAudioRanges(wordRanges)
      }
      await this.writeAlignedChapter(
        alignedChapter,
        holesByChapter.get(alignedChapter.chapter.id) ?? [],
      )
      collapsedStart += sentences.length
    }

    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")
    this.audioChapters = await writeAudioChapters(this.epub, chapters, locale)
    await this.addAudio(
      this.audioChapters.flatMap((chapter) =>
        chapter.holes.map((hole) => hole.audiofile),
      ),
    )

    this.report = await this.buildReport(collapsed, remaining, sources)

    await this.epub.addMetadata({
      type: "meta",
      properties: { property: "media:duration" },
      value: Epub.formatSmilDuration(this.totalDuration),
    })
    await this.epub.addMetadata({
      type: "meta",
      properties: { property: "media:active-class" },
      value: "-epub-media-overlay-active",
    })
    await this.epub.addManifestItem(
      {
        id: "storyteller_readaloud_styles",
        href: READALOUD_STYLESHEET,
        mediaType: "text/css",
      },
      `
.-epub-media-overlay-active {
  background-color: #ffb;
}
      `,
      "utf-8",
    )
  }

  private async buildReport(
    ranges: SentenceRange[],
    holes: Hole[],
    sources: Map<string, Awaited<ReturnType<typeof readTrackSource>>>,
  ): Promise<ReportV4> {
    const finalSpine = await this.epub.getSpineItems()
    return buildAlignerReport({
      aligner: "ctc",
      autoExclude: this.exclusions.autoExclude,
      audiofiles: this.audiofiles,
      durations: this.audioFileDurations,
      sources,
      spineIndex: new Map(finalSpine.map((item, i) => [item.id, i])),
      pending: this.pendingSpine.values(),
      ranges,
      holes,
      audioChapters: this.audioChapters,
      excludedAudio: this.excludedAudio(),
      sentenceScore: (chapterId, id) =>
        this.sentenceScores.get(slotKey({ chapterId, id })) ?? null,
      chapterSentences: (chapterId) => this.getChapterSentences(chapterId),
      debugChunks: this.chunkDebug,
    })
  }
}
