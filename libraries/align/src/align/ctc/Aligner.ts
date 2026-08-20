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

import { lookupAudioMime } from "@storyteller-platform/audiobook"
import { Epub, type ManifestItem } from "@storyteller-platform/epub"
import {
  type EmissionResult,
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"
import { type Mapping } from "@storyteller-platform/mapping"

import { parseDom } from "../../markup/parseDom.ts"
import { segmentChapter } from "../../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../../markup/transform.ts"
import {
  type SentenceRange,
  type WordRange,
  collapseSentenceRangeGaps,
  expandEmptySentenceRanges,
  getChapterDuration,
} from "../getSentenceRanges.ts"
import {
  type SentenceLengths,
  interpolateSentenceRanges,
  slotKey,
} from "../interpolateSentenceRanges.ts"
import { slugify } from "../slugify.ts"

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

export interface AlignOptions {
  reportsPath?: string | null | undefined
  granularity?: "sentence" | "word" | null | undefined
  textRef?: "id-fragment" | "text-fragment" | null | undefined
  outFormat?: "epub" | "gnp" | null | undefined
  primaryLocale?: Intl.Locale | null | undefined
  logger?: Logger | null | undefined
  onProgress?: ((progress: number) => void) | null | undefined
}

export class Aligner {
  private emissions: number[][]

  private vocab: Map<string, number>

  private blankId: number

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
    emissions: EmissionResult[],
    granularity: "sentence" | "word" | null | undefined,
    textRef: "id-fragment" | "text-fragment" | null | undefined,
    private languageOverride?: Intl.Locale | null,
    private logger?: Logger | null,
  ) {
    this.emissions = emissions.flatMap((e) => e.emissions)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.vocab = emissions[0]!.vocab
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.blankId = emissions[0]!.blankIndex

    this.audiofileFrames = new Map()
    this.audiofileEmissionTimings = new Map()
    let lastFrame = 0
    for (const [i, audiofile] of enumerate(audiofiles)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const emissionsResult = emissions[i]!

      const endFrame = lastFrame + emissionsResult.emissions.length
      this.audiofileFrames.set(audiofile, [lastFrame, endFrame])
      this.audioFileDurations[audiofile] = framesToSeconds(
        emissionsResult.emissions.length,
        emissionsResult,
      )
      this.audiofileEmissionTimings.set(audiofile, {
        secondsPerChunk: emissionsResult.secondsPerChunk,
        secondsPerFrame: emissionsResult.secondsPerFrame,
        framesPerChunk: emissionsResult.framesPerChunk,
      })

      lastFrame = endFrame
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
      new Set(sentenceRanges.map(({ audiofile }) => audiofile)),
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

        const mediaType = lookupAudioMime(base) ?? undefined
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
    score: number,
    chapterSentences: SegmentationResult["sentences"],
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
      chapterSentenceCount: chapterSentences.length,
      alignedSentenceCount: sentenceRanges.length,
      audioFiles,
    })

    updateAudioFileReports(this.report, audioFiles, this.audioFileDurations)
  }

  private getSentenceRanges(
    chapterId: string,
    slugifiedChapter: string,
    sentenceStarts: [number, number][],
    wordStarts: [number, number][][],
    emissionsStart: number,
    emissionsEnd: number,
    anchors: Match[],
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    // TODO: We should probably compute these with the emissionTimings
    const SENTENCE_PAD = 25
    const WORD_PAD = 8

    let alignments = ctcForcedAlign(
      slugifiedChapter,
      this.emissions.slice(emissionsStart, emissionsEnd),
      anchors
        .filter((a) => a.position > emissionsStart && a.position < emissionsEnd)
        .map((a) => ({ ...a, position: a.position - emissionsStart })),
      this.vocab,
      this.blankId,
    )

    const unscaledScore =
      alignments.reduce((acc, { score }) => acc + score, 0) / alignments.length

    const score = Math.max((unscaledScore + 10) * 10, 0)

    const droppedLabelRanges = sentenceStarts.filter(([s, e]) =>
      detectDroppedLabels(alignments, s, e),
    )

    if (droppedLabelRanges.length) {
      alignments = ctcForcedAlign(
        slugifiedChapter,
        this.emissions.slice(emissionsStart, emissionsEnd),
        anchors
          .filter(
            (a) => a.position > emissionsStart && a.position < emissionsEnd,
          )
          .map((a) => ({ ...a, position: a.position - emissionsStart })),
        this.vocab,
        this.blankId,
        droppedLabelRanges,
      )
    }

    const {
      sentenceRanges,
      skippedSentences,
      firstFoundSentence,
      lastFoundSentence,
      lastFoundSentenceEnd,
    } = this.buildSentenceRanges(
      alignments,
      sentenceStarts,
      emissionsStart,
      SENTENCE_PAD,
      chapterId,
    )

    const wordRanges = this.buildWordRanges(
      alignments,
      wordStarts,
      emissionsStart,
      WORD_PAD,
      skippedSentences,
      lastFoundSentenceEnd,
      chapterId,
    )

    if (firstFoundSentence === null) {
      return {
        score,
        sentenceRanges: [],
        wordRanges: [],
        alignedEmissionsStart: emissionsStart,
        alignedEmissionsEnd: emissionsStart,
        firstFoundSentence: 0,
        lastFoundSentence: 0,
      }
    }

    return {
      score,
      sentenceRanges,
      wordRanges,
      alignedEmissionsStart:
        alignments[sentenceStarts[firstFoundSentence]![0]]!.startFrame +
        emissionsStart,
      alignedEmissionsEnd:
        alignments[sentenceStarts[lastFoundSentence]![1]]!.endFrame +
        emissionsStart,
      firstFoundSentence,
      lastFoundSentence,
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  private buildSentenceRanges(
    alignments: TokenAlignment[],
    sentenceStarts: [number, number][],
    emissionsStart: number,
    padFrames: number,
    chapterId: string,
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const sentenceRanges: SentenceRange[] = []
    const skippedSentences = new Set<number>()

    let firstFoundSentence: null | number = null
    let lastFoundSentence = 0
    let lastFoundSentenceEnd = 0

    for (const [i, [startOffset, endOffset]] of enumerate(sentenceStarts)) {
      if (endOffset < startOffset) {
        skippedSentences.add(i)
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

      const { position: start, audiofile } = this.frameToAudioPosition(
        startFrame,
        emissionsStart,
      )
      const { position: end } = this.frameToAudioPosition(
        alignments[endOffset]!.endFrame,
        emissionsStart,
      )

      sentenceRanges.push({
        id: i,
        chapterId,
        start,
        end,
        audiofile,
      })
    }

    return {
      sentenceRanges,
      skippedSentences,
      firstFoundSentence,
      lastFoundSentence,
      lastFoundSentenceEnd,
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  private buildWordRanges(
    alignments: TokenAlignment[],
    wordStarts: [number, number][][],
    emissionsStart: number,
    padFrames: number,
    skippedSentences: Set<number>,
    prevEndFrame: number,
    chapterId: string,
  ) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const wordRanges: WordRange[][] = []
    let lastFoundWordEnd = prevEndFrame

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

        const { position: start, audiofile } = this.frameToAudioPosition(
          startFrame,
          emissionsStart,
        )

        const { position: end } = this.frameToAudioPosition(
          alignments[endOffset]!.endFrame,
          emissionsStart,
        )

        ranges.push({
          id: j,
          sentenceId: i,
          chapterId,
          start,
          end,
          audiofile,
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
    chapterSentences: SegmentationResult["sentences"],
    slugifiedChapter: string,
    sentenceStarts: [number, number][],
    wordStarts: [number, number][][],
    emissionsStart: number,
    emissionsEnd: number,
    anchors: Match[],
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
    } = this.getSentenceRanges(
      chapterId,
      slugifiedChapter,
      sentenceStarts,
      wordStarts,
      emissionsStart,
      emissionsEnd,
      anchors,
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
      xml: chapterXml,
      sentenceRanges,
      wordRanges,
      startOffset: alignedEmissionsStart,
      endOffset: alignedEmissionsEnd,
    })

    this.addChapterReport(
      spineIndex,
      chapter,
      score,
      chapterSentences,
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

  narrowToAvailableBoundary(boundary: { start: number; end: number }) {
    const available: number[] = [
      -1,
      ...this.alignedChapters
        .toSorted((a, b) => a.startOffset - b.startOffset)
        .flatMap(({ startOffset, endOffset }) => [startOffset, endOffset]),
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

      const result = await this.processSpineItem(
        index,
        spineItem,
        manifest,
        locale,
      )
      if (result) this.timing.add(result.timing.summary())
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
      return null
    }

    const chapterSentences = await this.getChapterSentences(chapterId)

    const slugifiedChapterSentences: string[] = []
    const chapterMappings: Mapping[] = []

    for (const chapterSentence of chapterSentences) {
      const { result, mapping } = await slugify(
        chapterSentence.text,
        locale,
        "",
      )
      slugifiedChapterSentences.push(result)
      chapterMappings.push(mapping)
    }

    let pos = 0
    const slugifiedChapterRanges: [number, number][] = []
    for (const sent of slugifiedChapterSentences) {
      slugifiedChapterRanges.push([pos, pos + sent.length - 1])
      pos += sent.length
    }

    const slugifiedWordStarts = chapterSentences.map((sent, i) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const cursor = chapterMappings[i]!.cursor()
      return sent.words.entries.map<[number, number]>((word) => [
        cursor.map(word.startOffset - sent.charRange.start) +
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          slugifiedChapterRanges[i]![0],
        cursor.map(word.endOffset - 1 - sent.charRange.start) +
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          slugifiedChapterRanges[i]![0],
      ])
    })

    if (chapterSentences.length === 0) {
      this.logger?.info(`Chapter #${index} has no text; skipping`)
      this.report.unalignedChapters.push({
        href: spineItem.href,
        reason: "no-text",
      })
      return null
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
      return null
    }

    const slugifiedChapter = slugifiedChapterSentences.join("")

    const boundaries = findCtcBoundaries(
      slugifiedChapter,
      this.emissions,
      this.vocab,
    )

    if (!boundaries) {
      this.logger?.info(`Could not find chapter #${index} in the transcripton`)
      this.report.unalignedChapters.push({
        href: spineItem.href,
        reason: "not-found",
        spineIndex: index,
        score: 0,
        chapterSentenceCount: chapterSentences.length,
        start: chapterSentences
          .slice(0, 3)
          .map((s) => s.text)
          .join("")
          .slice(0, 80),
        end: chapterSentences
          .slice(-3)
          .map((s) => s.text)
          .join("")
          .slice(-80),
      })
      return null
    }

    const { start, end } = this.narrowToAvailableBoundary(boundaries)
    if (start === end) {
      return null
    }

    const result = await this.alignChapter(
      index,
      chapterId,
      chapterSentences,
      slugifiedChapter,
      slugifiedChapterRanges,
      slugifiedWordStarts,
      start,
      end,
      boundaries.anchors,
    )

    return result
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
        alignedChapter.wordRanges[i] = expandEmptySentenceRanges(wordRanges)
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
