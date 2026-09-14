import { readFile } from "node:fs/promises"
import {
  basename,
  dirname,
  parse,
  parse as autoParse,
  relative,
} from "node:path/posix"

import { type SegmentationResult } from "@echogarden/text-segmentation"
import { enumerate, max } from "itertools"
import memoize from "memoize"
import { type Logger } from "pino"

import { Epub, type ManifestItem } from "@storyteller-platform/epub"
import {
  type Timing,
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"
import { type Mapping } from "@storyteller-platform/mapping"
import { MediaType } from "@storyteller-platform/media-types"

import { type EmissionsReader } from "../../emit/fs.ts"
import { parseDom } from "../../markup/parseDom.ts"
import { segmentChapter } from "../../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../../markup/transform.ts"
import {
  type AudioRange,
  SentenceRange,
  type WordRange,
  collapseSentenceRangeGaps,
  enforceMonotonicAudioRanges,
  expandEmptyAudioRanges,
  expandEmptySentenceRanges,
  getChapterDuration,
} from "../getSentenceRanges.ts"
import {
  type SentenceLengths,
  interpolateSentenceRanges,
  slotKey,
} from "../interpolateSentenceRanges.ts"
import { slugify, slugifiedWordRanges } from "../slugify.ts"

import { type EmissionTimings, framesToSeconds } from "./emissions.ts"
import {
  type TokenAlignment,
  ctcForcedAlign,
  detectDroppedLabels,
} from "./forcedAlign.ts"
import { buildFragmentMaps, createMediaOverlay } from "./mediaOverlay.ts"
import {
  type AlignedChapter,
  type Report,
  buildAudioFileContexts,
  updateAudioFileReports,
} from "./report.ts"
import { type Match, findCtcBoundaries } from "./search.ts"

const MAX_SEARCH_LENGTH = 40_000

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

  private totalDuration = 0

  private alignedChapters: AlignedChapter[] = []

  private timing = createAggregator()

  private granularity: "sentence" | "word"

  private textRef: "id-fragment" | "text-fragment"

  private audioFileDurations: Record<string, number> = {}

  public report: Report = {
    chapters: [],
    unalignedChapters: [],
    audioFiles: [],
    unalignedAudioFiles: [],
  }

  constructor(
    public epub: Epub,
    private audiofiles: string[],
    private emissionsReader: EmissionsReader,
    granularity: "sentence" | "word" | null | undefined,
    textRef: "id-fragment" | "text-fragment" | null | undefined,
    private languageOverride?: Intl.Locale | null,
    private logger?: Logger | null,
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

    this.getChapterSentences = memoize(this.getChapterSentences.bind(this))

    this.granularity = granularity ?? "sentence"

    this.textRef = textRef ?? "id-fragment"
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

  private async writeAlignedChapter(alignedChapter: AlignedChapter) {
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

    await this.addChapterAudio(sentenceRanges)

    const mediaOverlayId = await this.addMediaOverlay(
      chapter,
      sentenceRanges,
      wordRangeMap,
      sentenceIdToBlockFragment,
      sentenceIdToFragment,
      wordIdToFragment,
    )

    await this.epub.updateManifestItem(chapter.id, {
      ...chapter,
      mediaOverlay: mediaOverlayId,
    })

    await this.epub.writeXhtmlItemContents(chapter.id, xml)

    const chapterDuration = getChapterDuration(sentenceRanges)

    await this.epub.addMetadata({
      type: "meta",
      properties: {
        property: "media:duration",
        refines: `#${mediaOverlayId}`,
      },
      value: Epub.formatSmilDuration(chapterDuration),
    })
  }

  private async addChapterAudio(sentenceRanges: SentenceRange[]) {
    const audiofiles = Array.from(
      new Set(
        sentenceRanges.flatMap((sentenceRange) => sentenceRange.audiofiles),
      ),
    )

    await Promise.all(
      audiofiles.map(async (audiofile) => {
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
      ),
      "xml",
    )

    return mediaOverlayId
  }

  private addChapterReport(
    spineIndex: number,
    chapter: ManifestItem,
    chunk: number,
    score: number,
    chapterSentences: SegmentationResult["sentences"],
    sentenceCount: number,
    sentenceRanges: SentenceRange[],
    startSentence: number,
    endSentence: number,
    alignedEmissionsStart: number,
    alignedEmissionsEnd: number,
  ) {
    const audioFiles = buildAudioFileContexts(sentenceRanges)

    this.report.chapters.push({
      href: chapter.href,
      spineIndex,
      chunk,
      score,
      transcriptionOffset: alignedEmissionsStart,
      endTranscriptionOffset: alignedEmissionsEnd,
      firstMatchedSentenceId: startSentence,
      firstMatchedSentenceContext: {
        prevSentence: chapterSentences[startSentence - 1]?.text ?? null,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        matchedSentence: chapterSentences[startSentence]!.text,
        nextSentence: chapterSentences[startSentence + 1]?.text ?? null,
      },
      lastMatchedSentenceId: endSentence,
      lastMatchedSentenceContext: {
        prevSentence: chapterSentences[endSentence - 1]?.text ?? null,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        matchedSentence: chapterSentences[endSentence]!.text,
        nextSentence: chapterSentences[endSentence + 1]?.text ?? null,
      },
      chapterSentenceCount: sentenceCount,
      alignedSentenceCount: sentenceRanges.length,
      audioFiles,
    })

    updateAudioFileReports(this.report, audioFiles, this.audioFileDurations)
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
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    // TODO: We should probably compute these with the emissionTimings
    const SENTENCE_PAD = 25
    const WORD_PAD = 8

    const windowAnchors = anchors
      .filter(
        (a) =>
          a.position > emissionsStart &&
          a.position < emissionsEnd &&
          a.position - emissionsStart >= a.offset &&
          emissionsEnd - a.position >= slugifiedChapter.length - a.offset,
      )
      .map((a) => ({ ...a, position: a.position - emissionsStart }))

    const alignments = ctcForcedAlign(
      slugifiedChapter,
      await this.emissionsReader.readFrames(emissionsStart, emissionsEnd),
      windowAnchors,
      this.emissionsReader.vocab,
      this.emissionsReader.blankId,
      (labelOffset, alignments) =>
        sentenceStarts.filter(
          ([s, e]) =>
            s >= labelOffset &&
            e < labelOffset + alignments.length &&
            detectDroppedLabels(alignments, s - labelOffset, e - labelOffset),
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
    } = this.buildSentenceRanges(
      alignments,
      sentenceStarts,
      sentenceIndexOffset,
      emissionsStart,
      SENTENCE_PAD,
      chapterId,
      paddedChapterBoundaries,
      unpaddedChapterBoundaries,
    )

    const wordRanges = this.buildWordRanges(
      alignments,
      wordStarts,
      sentenceIndexOffset,
      emissionsStart,
      WORD_PAD,
      skippedSentences,
      sentenceFrameSpans,
      chapterId,
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
      }
    }

    return {
      score,
      sentenceRanges,
      wordRanges,
      alignedEmissionsStart: firstConfirmedStartFrame + emissionsStart,
      alignedEmissionsEnd: lastConfirmedEndFrame + emissionsStart,
      firstFoundSentence: sentenceIndexOffset + firstFoundSentence,
      lastFoundSentence: sentenceIndexOffset + lastFoundSentence,
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
      if (
        endOffset < paddedChapterBoundaries[0] ||
        startOffset >= paddedChapterBoundaries[1]
      ) {
        skippedSentences.add(i)
        continue
      }

      // Trailing sentences dropped as squeezed have no alignments at all
      if (endOffset >= alignments.length) {
        skippedSentences.add(i)
        continue
      }

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

      if (runLength < (endOffset + 1 - startOffset) / 2) {
        skippedSentences.add(i)
        continue
      }

      const goodChars = alignments
        .slice(runStart, runEnd + 1)
        .reduce((acc, a) => acc + (a.score > -4 ? 1 : 0), 0)

      if (goodChars / runLength < 0.5) {
        skippedSentences.add(i)
        continue
      }

      const framesPerChar =
        (alignments[runEnd]!.endFrame - alignments[runStart]!.startFrame) /
        runLength

      if (runLength > 8 && (framesPerChar < 2 || framesPerChar > 15)) {
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
        runStartFrame,
        lastFoundSentenceEnd,
        padFrames,
        emissionsStart,
      )
      const endFrame = Math.max(startFrame, runEndFrame)

      firstFoundSentence ??= i
      lastFoundSentence = i
      lastFoundSentenceEnd = endFrame
      sentenceFrameSpans.set(i, [startFrame, endFrame])

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
    padFrames: number,
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
          clamp(alignments[startOffset]!.startFrame),
          lastFoundWordEnd,
          padFrames,
          emissionsStart,
        )
        const endFrame = Math.max(
          startFrame,
          clamp(alignments[endOffset]!.endFrame),
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
    chapterSentences: SegmentationResult["sentences"],
    slugifiedChapter: string,
    sentenceStarts: [number, number][],
    wordStarts: [number, number][][],
    emissionsStart: number,
    emissionsEnd: number,
    anchors: Match[],
    paddedChapterBoundaries: [number, number],
    unpaddedChapterBoundaries: [number, number],
  ) {
    const timing = createTiming()

    timing.start("read contents")
    const manifest = await this.epub.getManifest()
    const chapter = manifest[chapterId]
    if (!chapter)
      throw new Error(
        `Failed to align chapter: could not find chapter with id ${chapterId} in manifest`,
      )
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)

    timing.start("align sentences")
    const {
      score,
      sentenceRanges,
      wordRanges,
      alignedEmissionsStart,
      alignedEmissionsEnd,
      firstFoundSentence,
      lastFoundSentence,
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
    )
    timing.end("align sentences")

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

    this.addChapterReport(
      spineIndex,
      chapter,
      chunk,
      score,
      chapterSentences,
      sentenceStarts.length,
      sentenceRanges,
      firstFoundSentence,
      lastFoundSentence,
      alignedEmissionsStart,
      alignedEmissionsEnd,
    )

    return {
      lastSentenceRange: sentenceRanges.at(-1) ?? null,
      alignedEmissionsEnd,
      timing,
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

    return { locale }
  }

  private async processSpine(
    onProgress: ((progress: number) => void) | null | undefined,
    locale: Intl.Locale,
  ) {
    const spine = await this.epub.getSpineItems()
    const manifest = await this.epub.getManifest()

    for (let index = 0; index < spine.length; index++) {
      onProgress?.(index / spine.length)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!

      this.logger?.info(
        `Aligning epub item #${index} : ${basename(spineItem.href)}`,
      )

      const results = await this.processSpineItem(
        index,
        spineItem,
        manifest,
        locale,
      )

      results.forEach((result) => this.timing.add(result.timing.summary()))
    }
  }

  private async processSpineItem(
    index: number,
    spineItem: { id: string; href: string },
    manifest: Record<string, ManifestItem>,
    locale: Intl.Locale,
  ) {
    const chapterId = spineItem.id
    if (manifest[chapterId]?.properties?.includes("nav")) {
      this.report.unalignedChapters.push({
        href: spineItem.href,
        reason: "is-nav",
      })
      return []
    }

    const chapterSentences = await this.getChapterSentences(chapterId)

    const slugifiedChapterSentences: string[] = []
    const chapterMappings: Mapping[] = []
    let slugifiedChapterLength = 0

    for (const chapterSentence of chapterSentences) {
      const { result, mapping } = await slugify(
        chapterSentence.text,
        locale,
        "",
      )
      slugifiedChapterSentences.push(result)
      slugifiedChapterLength += result.length
      chapterMappings.push(mapping)
    }

    if (chapterSentences.length === 0 || slugifiedChapterLength === 0) {
      this.logger?.info(`Chapter #${index} has no text; skipping`)
      this.report.unalignedChapters.push({
        href: spineItem.href,
        reason: "no-text",
      })
      return []
    }

    if (
      chapterSentences.length < 2 &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chapterSentences[0]!.words.length < 4
    ) {
      this.logger?.info(`Chapter #${index} is fewer than four words; skipping`)
      this.report.unalignedChapters.push({
        href: spineItem.href,
        reason: "too-short",
      })
      return []
    }

    const boundaries = await findCtcBoundaries(
      slugifiedChapterSentences.join(""),
      this.emissionsReader,
      this.getMatchedBoundaries(),
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
      timing: Timing
      alignedEmissionsEnd: number
    }[] = []

    const firstAlignedChapterIndex = this.alignedChapters.length

    for (const [
      chunkIndex,
      { firstSentence, sentences: chunkSentences },
    ] of enumerate(chunks)) {
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

      const boundaries = await findCtcBoundaries(
        chunkString,
        this.emissionsReader,
        this.getMatchedBoundaries(),
      )

      if (!boundaries) {
        this.logger?.info(
          `Could not find chapter #${index} in the transcripton`,
        )
        this.report.unalignedChapters.push({
          href: spineItem.href,
          reason: "not-found",
          spineIndex: index,
          score: 0,
          chapterSentenceCount: chunkSentences.length,
          start: chapterSentences
            .slice(firstSentence, firstSentence + 3)
            .map((s) => s.text)
            .join("")
            .slice(0, 80),
          end: chapterSentences
            .slice(
              Math.max(
                firstSentence,
                firstSentence + chunkSentences.length - 3,
              ),
              firstSentence + chunkSentences.length,
            )
            .map((s) => s.text)
            .join("")
            .slice(-80),
        })
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
        this.report.unalignedChapters.push({
          href: spineItem.href,
          reason: "not-found",
          spineIndex: index,
          score: 0,
          chapterSentenceCount: chunkSentences.length,
          start: chapterSentences
            .slice(firstSentence, firstSentence + 3)
            .map((s) => s.text)
            .join("")
            .slice(0, 80),
          end: chapterSentences
            .slice(
              Math.max(
                firstSentence,
                firstSentence + chunkSentences.length - 3,
              ),
              firstSentence + chunkSentences.length,
            )
            .map((s) => s.text)
            .join("")
            .slice(-80),
        })
        continue
      }

      const lastChunkSlugStart = slugifiedChapterLength - chunkString.length

      const chunkEvidenceHead =
        chunkIndex === 0
          ? (evidenceRange?.[0] ?? boundaries.evidenceRange[0])
          : boundaries.evidenceRange[0]
      const chunkEvidenceTail =
        chunkIndex === chunks.length - 1 && evidenceRange
          ? evidenceRange[1] - lastChunkSlugStart
          : boundaries.evidenceRange[1]

      const chunkMatchedHead =
        chunkIndex === 0
          ? (matchedRange?.[0] ?? boundaries.matchedRange[0])
          : boundaries.matchedRange[0]
      const chunkMatchedTail =
        chunkIndex === chunks.length - 1 && matchedRange
          ? matchedRange[1] - lastChunkSlugStart
          : boundaries.matchedRange[1]

      const result = await this.alignChapter(
        index,
        chapterId,
        chunkIndex,
        firstSentence,
        chapterSentences,
        chunkString,
        slugifiedChapterRanges,
        slugifiedWordStarts,
        start,
        end,
        boundaries.anchors,
        [chunkEvidenceHead, chunkEvidenceTail],
        [chunkMatchedHead, chunkMatchedTail],
      )

      results.push(result)
    }

    const chunkEntries = this.alignedChapters.slice(firstAlignedChapterIndex)
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
      enforceMonotonicAudioRanges(sentenceRanges, this.audiofiles),
      chapterSentenceCounts,
      this.audioFileDurations,
      sentenceLengths,
    )

    const expanded = expandEmptySentenceRanges(interpolated)
    const collapsed = await collapseSentenceRangeGaps(expanded)

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
      await this.writeAlignedChapter(alignedChapter)
      collapsedStart += sentences.length
    }

    for (const audiofile of this.audiofiles) {
      if (
        !this.report.audioFiles.some(({ filepath }) => filepath === audiofile)
      ) {
        this.report.unalignedAudioFiles.push({ filepath: audiofile })
      }
    }

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
        href: "Styles/storyteller-readaloud.css",
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
}
