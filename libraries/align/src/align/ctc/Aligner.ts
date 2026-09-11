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
  type SentenceRange,
  type WordRange,
  expandEmptySentenceRanges,
  getChapterDuration,
} from "../getSentenceRanges.ts"
import {
  type Hole,
  LEGACY_RANGE_BEHAVIOUR,
  type RangeBehaviour,
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
  type ReportHole,
  type ReportSpan,
  type ReportSpineItem,
  type ReportTrack,
  type ReportV3,
  type SentenceContext,
  assembleReport,
  buildChapterSpans,
  emptyReport,
  roundSeconds,
} from "../report-v3.ts"
import { slugify } from "../slugify.ts"

import { type EmissionTimings, framesToSeconds } from "./emissions.ts"
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

type PendingSpineItem = Pick<
  ReportSpineItem,
  "index" | "href" | "title" | "status" | "sentenceCount" | "preview"
> & { chapterId: string }

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

  public report: ReportV3 = emptyReport("ctc")

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
  ) {
    this.audiofileFrames = new Map()
    this.audiofileEmissionTimings = new Map()
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
      ...sentenceRanges.map(({ audiofile }) => audiofile),
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
        ...sentenceRanges,
        ...holes.map((hole) => ({
          ...hole,
          id: hole.sentenceId,
          chapterId: chapter.id,
          state: "unmatched" as const,
        })),
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
  ): Promise<{
    score: number
    sentenceRanges: SentenceRange[]
    wordRanges: WordRange[][]
    alignedEmissionsStart: number
    alignedEmissionsEnd: number
    firstFoundSentence: number
    lastFoundSentence: number
    droppedSentences: number[]
  }> {
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

    const droppedSentences = new Set<number>()
    const alignments = ctcForcedAlign(
      slugifiedChapter,
      await this.emissionsReader.readFrames(emissionsStart, emissionsEnd),
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
            droppedSentences.add(i)
            dropped.push([s, e])
          }
        }
        return dropped
      },
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
      firstFoundSentence,
      lastFoundSentence,
      firstConfirmedSentence,
      lastConfirmedSentence,
    } = this.buildSentenceRanges(
      alignments,
      sentenceStarts,
      sentenceIndexOffset,
      emissionsStart,
      SENTENCE_PAD,
      chapterId,
      paddedChapterBoundaries,
      unpaddedChapterBoundaries,
      droppedSentences,
    )

    const droppedIds = [...droppedSentences]
      .toSorted((a, b) => a - b)
      .map((i) => sentenceIndexOffset + i)

    const wordRanges = this.buildWordRanges(
      alignments,
      wordStarts,
      sentenceIndexOffset,
      emissionsStart,
      WORD_PAD,
      skippedSentences,
      chapterId,
    )

    if (firstFoundSentence === null || firstConfirmedSentence === null) {
      return {
        score,
        sentenceRanges: [],
        wordRanges: [],
        alignedEmissionsStart: emissionsStart,
        alignedEmissionsEnd: emissionsStart,
        firstFoundSentence: sentenceIndexOffset,
        lastFoundSentence: sentenceIndexOffset,
        droppedSentences: droppedIds,
      }
    }

    return {
      score,
      sentenceRanges,
      wordRanges,
      droppedSentences: droppedIds,
      alignedEmissionsStart:
        alignments[sentenceStarts[firstConfirmedSentence]![0]]!.startFrame +
        emissionsStart,
      alignedEmissionsEnd:
        alignments[sentenceStarts[lastConfirmedSentence]![1]]!.endFrame +
        emissionsStart,
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
    droppedSentences: Set<number>,
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const sentenceRanges: SentenceRange[] = []
    const skippedSentences = new Set<number>()

    let firstFoundSentence: null | number = null
    let lastFoundSentence = 0
    let lastFoundSentenceEnd = 0

    let firstConfirmedSentence: null | number = null
    let lastConfirmedSentence = 0

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
        droppedSentences.add(i)
        continue
      }

      const goodChars = alignments
        .slice(startOffset, endOffset + 1)
        .reduce((acc, a) => acc + (a.score > -4 ? 1 : 0), 0)

      if (goodChars / (endOffset + 1 - startOffset) < 0.5) {
        skippedSentences.add(i)
        continue
      }

      const sentenceLength = endOffset + 1 - startOffset

      const framesPerChar =
        (alignments[endOffset]!.endFrame -
          alignments[startOffset]!.startFrame) /
        sentenceLength

      if (sentenceLength > 8 && (framesPerChar < 2 || framesPerChar > 15)) {
        skippedSentences.add(i)
        if (framesPerChar < 2) droppedSentences.add(i)
        continue
      }

      const startFrame = this.refineStartFrame(
        alignments[startOffset]!.startFrame,
        lastFoundSentenceEnd,
        padFrames,
        emissionsStart,
      )

      firstFoundSentence ??= i
      lastFoundSentence = i
      lastFoundSentenceEnd = alignments[endOffset]!.endFrame

      const sentenceScores = alignments
        .slice(startOffset, endOffset + 1)
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

      const { start, end, audiofile } = this.frameRangeToAudioRange(
        startFrame,
        alignments[endOffset]!.endFrame,
        emissionsStart,
      )

      sentenceRanges.push({
        id: sentenceIndexOffset + i,
        chapterId,
        start,
        end,
        audiofile,
        state: "matched",
      })

      if (
        startOffset <= unpaddedChapterBoundaries[1] &&
        endOffset >= unpaddedChapterBoundaries[0]
      ) {
        firstConfirmedSentence ??= i
        lastConfirmedSentence = i
      }
    }

    return {
      sentenceRanges,
      skippedSentences,
      firstFoundSentence,
      lastFoundSentence,
      lastFoundSentenceEnd,
      firstConfirmedSentence,
      lastConfirmedSentence,
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
    chapterId: string,
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const wordRanges: WordRange[][] = []
    let lastFoundWordEnd = 0

    for (const [i, ws] of enumerate(wordStarts)) {
      if (skippedSentences.has(i)) continue

      const ranges: WordRange[] = []
      for (const [j, [startOffset, endOffset]] of enumerate(ws)) {
        if (endOffset < startOffset) continue

        const goodChars = alignments
          .slice(startOffset, endOffset + 1)
          .reduce((acc, a) => acc + (a.score > -4 ? 1 : 0), 0)

        if (goodChars / (endOffset + 1 - startOffset) < 0.5) {
          continue
        }

        const startFrame = this.refineStartFrame(
          alignments[startOffset]!.startFrame,
          lastFoundWordEnd,
          padFrames,
          emissionsStart,
        )

        lastFoundWordEnd = alignments[endOffset]!.endFrame

        const { start, end, audiofile } = this.frameRangeToAudioRange(
          startFrame,
          alignments[endOffset]!.endFrame,
          emissionsStart,
        )

        ranges.push({
          id: j,
          sentenceId: sentenceIndexOffset + i,
          chapterId,
          start,
          end,
          audiofile,
          state: "matched",
        })
      }
      if (ranges.length) wordRanges.push(ranges)
    }

    return wordRanges
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
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

  private frameRangeToAudioRange(
    startFrame: number,
    endFrame: number,
    emissionsStart: number,
  ): { start: number; end: number; audiofile: string } {
    const { position: start, audiofile } = this.frameToAudioPosition(
      startFrame,
      emissionsStart,
    )
    const endPosition = this.frameToAudioPosition(endFrame, emissionsStart)
    if (endPosition.audiofile === audiofile) {
      return { start, end: endPosition.position, audiofile }
    }
    return {
      start,
      end: this.audioFileDurations[audiofile] ?? start,
      audiofile,
    }
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
      droppedSentences,
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
      timing,
    }
  }

  private getMatchedBoundaries() {
    return this.alignedChapters
      .toSorted((a, b) => a.startOffset - b.startOffset)
      .map<
        [number, number]
      >(({ startOffset, endOffset }) => [startOffset, endOffset])
  }

  private narrowToAvailableBoundary(boundary: { start: number; end: number }) {
    const available: number[] = [
      -1,
      ...this.getMatchedBoundaries().flat(),
      Infinity,
    ]

    const withinBoundary: [number, number][] = []
    for (let i = 0; i < available.length - 1; i += 2) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [start, end] = [available[i]!, available[i + 1]!]
      if (
        (boundary.start <= start && boundary.end >= start) ||
        (boundary.start <= end && boundary.end >= end)
      ) {
        withinBoundary.push([
          Math.max(boundary.start, start + 1),
          Math.min(boundary.end, end - 1),
        ])
      }
    }

    const largestBoundary = max(withinBoundary, ([start, end]) => end - start)

    if (!largestBoundary) return { start: boundary.start, end: boundary.end }

    return { start: largestBoundary[0], end: largestBoundary[1] }
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
    const manifest = await this.epub.getManifest()

    for (let index = 0; index < spine.length; index++) {
      this.abortSignal?.throwIfAborted()
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
    const title = this.titles.get(hrefStem(spineItem.href)) ?? null

    if (manifest[chapterId]?.properties?.includes("nav")) {
      this.markSpine({
        index,
        href: spineItem.href,
        chapterId,
        title,
        status: "is-nav",
        sentenceCount: 0,
        preview: null,
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
      this.markSpine({
        index,
        href: spineItem.href,
        chapterId,
        title,
        status: "no-text",
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
        sentenceCount: chapterSentences.length,
        preview: previewOf(chapterSentences),
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
        const cursor = chapterMappings[firstSentence + i]!.cursor()
        return sent.words.entries
          .filter((word) => !word.isPunctuation)
          .map<[number, number]>((word) => [
            cursor.map(word.startOffset - sent.charRange.start) +
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              slugifiedChapterRanges[i]![0],
            cursor.map(word.endOffset - 1 - sent.charRange.start) +
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              slugifiedChapterRanges[i]![0],
          ])
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
        continue
      }

      const { start, end } = this.narrowToAvailableBoundary(boundaries)
      if (start === end) {
        this.logger?.info(
          `Could not find chapter #${index} in the transcripton`,
        )
        continue
      }

      const lastChunkSlugStart = slugifiedChapterLength - chunkString.length

      const chunkEvidenceHead =
        chunkIndex === 0
          ? evidenceRange?.[0] ?? boundaries.evidenceRange[0]
          : boundaries.evidenceRange[0]
      const chunkEvidenceTail =
        chunkIndex === chunks.length - 1 && evidenceRange
          ? evidenceRange[1] - lastChunkSlugStart
          : boundaries.evidenceRange[1]

      const chunkMatchedHead =
        chunkIndex === 0
          ? matchedRange?.[0] ?? boundaries.matchedRange[0]
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
    this.markSpine({
      index,
      href: spineItem.href,
      chapterId,
      title,
      status: chunkEntries.length > 0 ? "aligned" : "not-found",
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
        firstRangeA.audiofile,
      )
      const firstAudiofileIndexB = this.audiofiles.indexOf(
        firstRangeB.audiofile,
      )
      if (firstAudiofileIndexA === firstAudiofileIndexB) {
        return firstRangeA.start - firstRangeB.start
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
      sentenceRanges,
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
    const { chapters, remaining } = planAudioChapters(
      holes,
      this.behaviour,
      this.audioFileDurations,
      (file) => sources.get(file)?.title ?? null,
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
        alignedChapter.wordRanges[i] = expandEmptySentenceRanges(wordRanges)
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
  ): Promise<ReportV3> {
    const trackIndex = new Map(this.audiofiles.map((file, i) => [file, i]))
    const finalSpine = await this.epub.getSpineItems()
    const spineIndex = new Map(finalSpine.map((item, i) => [item.id, i]))
    const indexOf = (chapterId: string, fallback: number) =>
      spineIndex.get(chapterId) ?? fallback
    const rangesByChapter = new Map<string, SentenceRange[]>()
    for (const range of ranges) {
      const list = rangesByChapter.get(range.chapterId) ?? []
      list.push(range)
      rangesByChapter.set(range.chapterId, list)
    }

    const spine: Omit<
      ReportSpineItem,
      | "matchedSentenceCount"
      | "interpolatedSentenceCount"
      | "droppedSentenceCount"
      | "matchedSeconds"
      | "interpolatedSeconds"
      | "looseSeconds"
      | "score"
    >[] = []
    const spans: ReportSpan[] = []
    const remapped = new Map<number, number>()

    for (const pending of this.pendingSpine.values()) {
      const { chapterId, ...original } = pending
      const item = { ...original, index: indexOf(chapterId, original.index) }
      remapped.set(original.index, item.index)
      let firstMatch: SentenceContext | null = null
      let lastMatch: SentenceContext | null = null

      if (item.sentenceCount > 0) {
        const chapterSpans = buildChapterSpans({
          spine: item.index,
          sentenceCount: item.sentenceCount,
          ranges: rangesByChapter.get(chapterId) ?? [],
          trackIndex: (audiofile) => trackIndex.get(audiofile) ?? -1,
          sentenceScore: (id) =>
            this.sentenceScores.get(slotKey({ chapterId, id })) ?? null,
        })
        spans.push(...chapterSpans)

        const aligned = chapterSpans.filter((span) => span.state === "aligned")
        const first = aligned[0]
        const last = aligned.at(-1)
        if (first && last) {
          const sentences = await this.getChapterSentences(chapterId)
          const context = (id: number): SentenceContext => ({
            prevSentence: sentences[id - 1]?.text ?? null,
            matchedSentence: sentences[id]?.text ?? "",
            nextSentence: sentences[id + 1]?.text ?? null,
          })
          firstMatch = context(first.firstSentence)
          lastMatch = context(last.lastSentence)
        }
      }

      spine.push({ ...item, firstMatch, lastMatch })
    }

    for (const chapter of this.audioChapters) {
      spine.push({
        index: indexOf(chapter.id, -1),
        href: chapter.href,
        title: chapter.title,
        status: "audio-only",
        sentenceCount: 0,
        firstMatch: null,
        lastMatch: null,
        preview: null,
      })
    }

    const reportHoles: ReportHole[] = []
    const toAudio = (hole: Hole) => ({
      track: trackIndex.get(hole.audiofile) ?? -1,
      start: roundSeconds(hole.start),
      end: roundSeconds(hole.end),
    })
    for (const hole of holes) {
      reportHoles.push({
        spine: indexOf(hole.anchor.chapterId, -1),
        sentence: hole.anchor.sentenceId,
        position: hole.anchor.position,
        audio: toAudio(hole),
      })
    }
    for (const chapter of this.audioChapters) {
      for (const hole of chapter.holes) {
        reportHoles.push({
          spine: indexOf(chapter.id, -1),
          sentence: 0,
          position: "after",
          audio: toAudio(hole),
        })
      }
    }

    const tracks: Omit<
      ReportTrack,
      "matchedSeconds" | "interpolatedSeconds" | "looseSeconds"
    >[] = []
    let offset = 0
    for (const [index, audiofile] of enumerate(this.audiofiles)) {
      const duration = this.audioFileDurations[audiofile] ?? 0
      const source = sources.get(audiofile) ?? null
      tracks.push({
        index,
        name: basename(audiofile),
        duration: roundSeconds(duration),
        offset: roundSeconds(offset),
        source: source
          ? {
              file: source.source,
              start: source.start,
              end: source.end,
              title: source.title ?? null,
            }
          : null,
      })
      offset += duration
    }

    return assembleReport({
      aligner: "ctc",
      spine,
      tracks,
      spans,
      holes: reportHoles,
      debug: {
        chunks: this.chunkDebug.map((chunk) => ({
          ...chunk,
          spine: remapped.get(chunk.spine) ?? chunk.spine,
        })),
      },
    })
  }
}
