import { randomUUID } from "node:crypto"
import { createWriteStream, rmSync } from "node:fs"
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import {
  basename as autoBasename,
  dirname as autoDirname,
  extname,
  join as autoJoin,
  parse as autoParse,
} from "node:path"
import { basename, dirname, parse, relative } from "node:path/posix"

import { type SegmentationResult } from "@echogarden/text-segmentation"
import { LocalizedString } from "@readium/shared"
import { enumerate, max } from "itertools"
import memoize from "memoize"
import { type Logger } from "pino"
import { ZipFile } from "yazl"

import { isAudioFile, lookupAudioMime } from "@storyteller-platform/audiobook"
import {
  Epub,
  type ManifestItem,
  type ParsedXml,
} from "@storyteller-platform/epub"
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
  generateGuidedNavigationDocuments,
  generateGuidedNavigationManifest,
} from "../../readium/guidedNavigation.ts"
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
import { TextFragmentFactory } from "../textFragments.ts"

import { ctcForcedAlign } from "./forcedAlign.ts"
import { type Match, findCtcBoundaries } from "./search.ts"

type AlignedChapter = {
  chapter: ManifestItem
  xml: ParsedXml
  sentenceRanges: SentenceRange[]
  wordRanges: WordRange[][]
  startOffset: number
  endOffset: number
}

interface AudioFileContext {
  start: number
  end: number
  filepath: string
}

interface ChapterReport {
  href: string

  transcriptionOffset: number
  endTranscriptionOffset: number
  // transcriptionContext: {
  //   before: string
  //   after: string
  // }
  // endTranscriptionContext: {
  //   before: string
  //   after: string
  // }

  firstMatchedSentenceId: number
  firstMatchedSentenceContext: {
    prevSentence: string | null
    matchedSentence: string
    nextSentence: string | null
  }

  lastMatchedSentenceId: number
  lastMatchedSentenceContext: {
    prevSentence: string | null
    matchedSentence: string
    nextSentence: string | null
  }

  chapterSentenceCount: number
  alignedSentenceCount: number

  audioFiles: AudioFileContext[]
}

type UnalignedChapterReason = "too-short" | "not-found" | "is-nav" | "no-text"

interface UnalignedChapterReport {
  href: string

  reason: Exclude<UnalignedChapterReason, "not-found">
}

interface UnalignedNotFoundChapterReport {
  href: string

  reason: "not-found"

  start: string
  end: string
}

interface AudioFileReport {
  filepath: string

  matchedRanges: {
    start: number
    end: number
  }[]

  duration: number
  alignedDuration: number
}

interface UnalignedAudioFileReport {
  filepath: string
}

interface Report {
  chapters: ChapterReport[]
  unalignedChapters: (UnalignedChapterReport | UnalignedNotFoundChapterReport)[]
  audioFiles: AudioFileReport[]
  unalignedAudioFiles: UnalignedAudioFileReport[]
}

export interface AlignOptions {
  reportsPath?: string | null | undefined
  granularity?: "sentence" | "word" | null | undefined
  textRef?: "id-fragment" | "text-fragment" | null | undefined
  outFormat?: "epub" | "gnp" | null | undefined
  primaryLocale?: Intl.Locale | null | undefined
  logger?: Logger | null | undefined
  onProgress?: ((progress: number) => void) | null | undefined
}

export async function ctcAlign(
  input: string,
  output: string,
  emissionsDir: string,
  audiobookDir: string,
  options: AlignOptions,
) {
  const outFormat = options.outFormat ?? "epub"
  const epubPath =
    outFormat === "epub"
      ? autoJoin(
          tmpdir(),
          `storyteller-platform-align-${randomUUID()}`,
          autoBasename(output),
        )
      : input

  using stack = new DisposableStack()
  stack.defer(() => {
    if (outFormat === "epub") {
      try {
        rmSync(autoDirname(epubPath), { recursive: true, force: true })
      } catch {
        // This is a best effort cleanup of a tmp file, it's fine
        // if it fails
      }
    }
  })

  if (outFormat === "epub") {
    await mkdir(autoDirname(epubPath), { recursive: true })
    await copyFile(input, epubPath)
  }

  const audiobookFiles = await readdir(audiobookDir).then((filenames) =>
    filenames
      .filter((f) => isAudioFile(f))
      .map((f) => autoJoin(audiobookDir, f)),
  )

  using epub = await Epub.from(epubPath)

  const emissions = await readdir(emissionsDir)
    .then((filenames) =>
      filenames
        .filter((f) => f.endsWith(".json"))
        .map((f) => autoJoin(emissionsDir, f)),
    )
    .then((filepaths) =>
      Promise.all(
        filepaths.map(async (p) => readFile(p, { encoding: "utf-8" })),
      ),
    )
    .then((contents) =>
      contents.map((c) => {
        const parsed = JSON.parse(c) as Omit<EmissionResult, "vocab"> & {
          vocab: Record<string, number>
        }
        return {
          ...parsed,
          vocab: new Map(Object.entries(parsed.vocab)),
        } as EmissionResult
      }),
    )

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    emissions,
    options.granularity,
    options.textRef,
    options.primaryLocale,
    options.logger,
  )

  const timing = await aligner.alignBook(options.onProgress)

  if (outFormat === "epub") {
    await epub.saveAndClose()
    await mkdir(autoDirname(output), { recursive: true })
    await copyFile(epubPath, output)
  } else {
    const guidedNavigationDocuments =
      await generateGuidedNavigationDocuments(epub)

    const manifest = generateGuidedNavigationManifest(
      new LocalizedString(
        (await epub.getTitle()) ?? autoBasename(input, extname(input)),
      ),
      guidedNavigationDocuments,
    )

    const tmpArchivePath = autoJoin(
      tmpdir(),
      `storyteller-platform-epub-${randomUUID()}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const { promise, resolve } = Promise.withResolvers<void>()
    const zipfile = new ZipFile()

    const writeStream = createWriteStream(tmpArchivePath)

    writeStream.on("close", () => {
      resolve()
    })

    await using stack = new AsyncDisposableStack()
    stack.defer(async () => {
      writeStream.close()
      await rm(tmpArchivePath, { force: true })
    })

    zipfile.outputStream.pipe(writeStream)

    zipfile.addBuffer(
      Buffer.from(JSON.stringify(manifest.serialize())),
      "manifest.json",
    )

    for (const doc of guidedNavigationDocuments) {
      const selfLink = doc.links?.findWithRel("self")
      if (!selfLink) continue
      zipfile.addBuffer(
        Buffer.from(JSON.stringify(doc.serialize())),
        selfLink.href,
      )
    }

    zipfile.end()
    await promise

    await cp(tmpArchivePath, output)

    epub.discardAndClose()
  }

  if (options.reportsPath) {
    await mkdir(autoDirname(options.reportsPath), { recursive: true })

    await writeFile(
      options.reportsPath,
      JSON.stringify(aligner.report, null, 2),
      {
        encoding: "utf-8",
      },
    )
  }

  return timing
}

type EmissionTimings = Pick<
  EmissionResult,
  "secondsPerChunk" | "secondsPerFrame" | "framesPerChunk"
>

function framesToSeconds(frames: number, emissionTimings: EmissionTimings) {
  return (
    Math.floor(frames / emissionTimings.framesPerChunk) *
      emissionTimings.secondsPerChunk +
    (frames % emissionTimings.framesPerChunk) * emissionTimings.secondsPerFrame
  )
}

export class Aligner {
  private emissions: number[][]

  private emissionTimings: EmissionTimings

  private vocab: Map<string, number>

  private blankId: number

  private audiofileFrames: Map<string, [number, number]>

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.emissionTimings = emissions[0]!

    this.audiofileFrames = new Map()
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

    let sentenceIdToBlockFragment: Map<number, string> | null = null

    const sentenceIdToFragment = new Map(
      sentenceRanges.map((range) => [
        range.id,
        `${range.chapterId}-s${range.id}`,
      ]),
    )

    const wordIdToFragment = new Map<number, Map<number, string>>(
      wordRanges.map((ranges) => [
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ranges[0]!.sentenceId,
        new Map(
          ranges.map((range) => [
            range.id,
            `${range.chapterId}-s${range.sentenceId}-w${range.id}`,
          ]),
        ),
      ]),
    )

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wordRangeMap = new Map(wordRanges.map((w) => [w[0]!.sentenceId, w]))

    if (this.textRef === "text-fragment") {
      sentenceIdToBlockFragment = new Map()
      const blocks: string[][] = [[]]
      for (const [i, sentence] of enumerate(sentences)) {
        const text = sentence.text
        blocks.at(-1)?.push(text)
        if (text.includes("\n") && i < sentences.length - 1) {
          blocks.push([])
        }
      }

      const blockFactory = new TextFragmentFactory(
        blocks.map((block) => block.join("")),
        locale,
      )

      let sentenceRangeIndex = 0
      for (const [i, block] of enumerate(blocks)) {
        sentenceIdToBlockFragment.set(
          sentenceRangeIndex,
          blockFactory.findMinimalFragment(i),
        )

        const sentenceFactory = new TextFragmentFactory(
          block.map((s) => s.replace("\n", "")),
          locale,
        )

        const blockRanges = sentenceRanges.slice(
          sentenceRangeIndex,
          sentenceRangeIndex + block.length,
        )

        for (const [j, range] of enumerate(blockRanges)) {
          sentenceIdToFragment.set(
            range.id,
            sentenceFactory.findMinimalFragment(j),
          )
        }

        if (this.granularity === "word") {
          const allWords: string[] = []
          for (const range of blockRanges) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const sentence = sentences[range.id]!
            const words: string[] = []
            for (const w of sentence.words.entries) {
              if (w.isPunctuation) {
                const lastWord = words.at(-1)
                if (lastWord === undefined) {
                  continue
                }
                words[words.length - 1] = lastWord + w.text.replace("\n", "")
              } else {
                words.push(w.text)
              }
            }
            allWords.push(...words)
          }

          const wordFactory = new TextFragmentFactory(allWords)

          let wordRangeIndex = 0
          for (const range of blockRanges) {
            const wordRanges = wordRangeMap.get(range.id)
            const toFragment = wordIdToFragment.get(range.id)
            if (!wordRanges || !toFragment) continue

            for (const [k, wordRange] of enumerate(wordRanges)) {
              toFragment.set(
                wordRange.id,
                wordFactory.findMinimalFragment(k + wordRangeIndex),
              )
            }

            wordRangeIndex += wordRanges.length
          }
        }

        sentenceRangeIndex += block.length
      }
    }

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

  private addChapterReport(
    chapter: ManifestItem,
    chapterSentences: SegmentationResult["sentences"],
    sentenceRanges: SentenceRange[],
    startSentence: number,
    endSentence: number,
    alignedEmissionsStart: number,
    alignedEmissionsEnd: number,
  ) {
    const audioFiles = sentenceRanges.reduce<AudioFileContext[]>(
      (acc, range) => {
        const existing = acc.find(
          (context) => context.filepath === range.audiofile,
        )
        if (existing) {
          existing.end = range.end
          return acc
        }
        acc.push({
          filepath: range.audiofile,
          start: range.start,
          end: range.end,
        })
        return acc
      },
      [],
    )

    this.report.chapters.push({
      href: chapter.href,
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

    for (const audioFile of audioFiles) {
      const existing = this.report.audioFiles.find(
        ({ filepath }) => audioFile.filepath === filepath,
      )
      if (existing) {
        existing.matchedRanges.push({
          start: audioFile.start,
          end: audioFile.end,
        })
        existing.matchedRanges.sort((a, b) => a.start - b.start)
        existing.alignedDuration += audioFile.end - audioFile.start
      } else {
        this.report.audioFiles.push({
          alignedDuration: audioFile.end - audioFile.start,
          duration: this.audioFileDurations[audioFile.filepath] ?? 0,
          filepath: audioFile.filepath,
          matchedRanges: [{ start: audioFile.start, end: audioFile.end }],
        })
      }
    }
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
    const frameToAudioPosition = (frame: number) => {
      const globalFrame = frame + emissionsStart

      for (const [audiofile, [fileStart, fileEnd]] of this.audiofileFrames) {
        if (globalFrame < fileEnd) {
          return {
            position: framesToSeconds(
              globalFrame - fileStart,
              this.emissionTimings,
            ),
            audiofile,
          }
        }
      }

      throw new Error(`Frame ${globalFrame} is beyond the end of the emissions`)
    }

    const alignments = ctcForcedAlign(
      slugifiedChapter,
      this.emissions.slice(emissionsStart, emissionsEnd),
      anchors
        .filter((a) => a.position > emissionsStart && a.position < emissionsEnd)
        .map((a) => ({ ...a, position: a.position - emissionsStart })),
      this.vocab,
      this.blankId,
    )

    const sentenceRanges: SentenceRange[] = []
    const skippedSentences = new Set<number>()

    let firstFoundSentence: null | number = null
    let lastFoundSentence = 0

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

      if (sentenceLength > 8 && (framesPerChar < 1 || framesPerChar > 15)) {
        skippedSentences.add(i)
        continue
      }

      firstFoundSentence ??= i
      lastFoundSentence = i

      const { position: start, audiofile } = frameToAudioPosition(
        alignments[startOffset]!.startFrame,
      )
      const { position: end } = frameToAudioPosition(
        alignments[endOffset]!.endFrame,
      )

      sentenceRanges.push({
        id: i,
        chapterId,
        start,
        end,
        audiofile,
      })
    }

    const wordRanges: WordRange[][] = []

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
        const { position: start, audiofile } = frameToAudioPosition(
          alignments[startOffset]!.startFrame,
        )

        const { position: end } = frameToAudioPosition(
          alignments[endOffset]!.endFrame,
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

    if (firstFoundSentence === null) {
      return {
        sentenceRanges: [],
        wordRanges: [],
        alignedEmissionsStart: emissionsStart,
        alignedEmissionsEnd: emissionsStart,
        firstFoundSentence: 0,
        lastFoundSentence: 0,
      }
    }

    return {
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

  private async alignChapter(
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
      chapter,
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
    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")

    this.timing.setMetadata("language", locale.toString())
    this.timing.setMetadata("granularity", this.granularity)

    const spine = await this.epub.getSpineItems()
    const manifest = await this.epub.getManifest()

    for (let index = 0; index < spine.length; index++) {
      onProgress?.(index / spine.length)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!

      this.logger?.info(
        `Aligning epub item #${index} : ${basename(spineItem.href)}`,
      )

      const chapterId = spineItem.id
      if (manifest[chapterId]?.properties?.includes("nav")) {
        this.report.unalignedChapters.push({
          href: spineItem.href,
          reason: "is-nav",
        })
        continue
      }

      const chapterSentences = await this.getChapterSentences(chapterId)

      const slugifiedChapterSentences: string[] = []
      const chapterMappings: Mapping[] = []

      for (const chapterSentence of chapterSentences) {
        const { result, mapping } = await slugify(chapterSentence.text, locale)
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cursor.map(word.startOffset) + slugifiedChapterRanges[i]![0],
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cursor.map(word.endOffset - 1) + slugifiedChapterRanges[i]![0],
        ])
      })

      if (chapterSentences.length === 0) {
        this.logger?.info(`Chapter #${index} has no text; skipping`)
        this.report.unalignedChapters.push({
          href: spineItem.href,
          reason: "no-text",
        })
        continue
      }
      if (
        chapterSentences.length < 2 &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chapterSentences[0]!.words.length < 4
      ) {
        this.logger?.info(
          `Chapter #${index} is fewer than four words; skipping`,
        )
        this.report.unalignedChapters.push({
          href: spineItem.href,
          reason: "too-short",
        })
        continue
      }

      const slugifiedChapter = slugifiedChapterSentences.join("")

      const boundaries = findCtcBoundaries(
        slugifiedChapter,
        this.emissions,
        this.vocab,
      )

      if (!boundaries) {
        this.logger?.info(
          `Could not find chapter #${index} in the transcripton`,
        )
        this.report.unalignedChapters.push({
          href: spineItem.href,
          reason: "not-found",
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
        continue
      }

      const { start, end } = this.narrowToAvailableBoundary(boundaries)
      if (start === end) {
        continue
      }

      const result = await this.alignChapter(
        chapterId,
        chapterSentences,
        slugifiedChapter,
        slugifiedChapterRanges,
        slugifiedWordStarts,
        start,
        end,
        boundaries.anchors,
      )

      this.timing.add(result.timing.summary())
    }

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

    return this.timing
  }
}

function createMediaOverlay(
  chapter: ManifestItem,
  granularity: "sentence" | "word",
  sentenceRanges: SentenceRange[],
  wordRanges: Map<number, WordRange[]>,
  sentenceIdToBlockFragment: Map<number, string> | null,
  sentenceIdToFragment: Map<number, string>,
  wordIdToFragment: Map<number, Map<number, string>>,
) {
  const subSequences = sentenceIdToBlockFragment
    ? createTextRangeLargeSequences(
        chapter,
        granularity,
        sentenceRanges,
        wordRanges,
        sentenceIdToBlockFragment,
        sentenceIdToFragment,
        wordIdToFragment,
      )
    : createTextRangeSmallSequences(
        chapter,
        granularity,
        sentenceRanges,
        wordRanges,
        sentenceIdToFragment,
        wordIdToFragment,
      )

  return [
    Epub.createXmlElement(
      "smil",
      {
        xmlns: "http://www.w3.org/ns/SMIL",
        "xmlns:epub": "http://www.idpf.org/2007/ops",
        version: "3.0",
      },
      [
        Epub.createXmlElement("body", {}, [
          Epub.createXmlElement(
            "seq",
            {
              id: `${chapter.id}_overlay`,
              "epub:textref": `../${chapter.href}`,
              "epub:type": "chapter",
            },
            subSequences,
          ),
        ]),
      ],
    ),
  ]
}

function createTextRangeLargeSequences(
  chapter: ManifestItem,
  granularity: "sentence" | "word",
  sentenceRanges: SentenceRange[],
  wordRanges: Map<number, WordRange[]>,
  sentenceIdToBlockFragment: Map<number, string>,
  sentenceIdToFragment: Map<number, string>,
  wordIdToFragment: Map<number, Map<number, string>>,
) {
  const blockStarts = sentenceIdToBlockFragment
    .entries()
    .toArray()
    .toSorted(([a], [b]) => a - b)

  return blockStarts.map(([sentenceId, fragment], index) => {
    const blockEnd =
      index === blockStarts.length - 1
        ? sentenceRanges.length - 1
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          blockStarts[index + 1]![0]

    const sentences = sentenceRanges.slice(sentenceId, blockEnd)

    return Epub.createXmlElement(
      "seq",
      {
        id: `${chapter.id}-b${index}`,
        "epub:type": "text-range-large",
        "epub:textref": `../${chapter.href}#${fragment}`,
      },
      createTextRangeSmallSequences(
        chapter,
        granularity,
        sentences,
        wordRanges,
        sentenceIdToFragment,
        wordIdToFragment,
      ),
    )
  })
}

function createTextRangeSmallSequences(
  chapter: ManifestItem,
  granularity: "sentence" | "word",
  sentenceRanges: SentenceRange[],
  wordRanges: Map<number, WordRange[]>,
  sentenceIdToFragment: Map<number, string>,
  wordIdToFragment: Map<number, Map<number, string>>,
) {
  return sentenceRanges.map((sentenceRange) => {
    if (granularity === "sentence" || !wordRanges.has(sentenceRange.id)) {
      return Epub.createXmlElement(
        "par",
        {
          id: `${chapter.id}-s${sentenceRange.id}`,
        },
        [
          Epub.createXmlElement("text", {
            src: `../${chapter.href}#${sentenceIdToFragment.get(sentenceRange.id)}`,
          }),
          Epub.createXmlElement("audio", {
            src: `../Audio/${basename(sentenceRange.audiofile)}`,
            clipBegin: `${sentenceRange.start.toFixed(3)}s`,
            clipEnd: `${sentenceRange.end.toFixed(3)}s`,
          }),
        ],
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const words = wordRanges.get(sentenceRange.id)!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wordToFragment = wordIdToFragment.get(sentenceRange.id)!

    return Epub.createXmlElement(
      "seq",
      {
        id: `${chapter.id}-s${sentenceRange.id}`,
        "epub:type": "text-range-small",
        "epub:textref": `../${chapter.href}#${sentenceIdToFragment.get(sentenceRange.id)}`,
      },
      words.map((word) =>
        Epub.createXmlElement(
          "par",
          {
            id: `${chapter.id}-s${sentenceRange.id}-w${word.id}`,
          },
          [
            Epub.createXmlElement("text", {
              src: `../${chapter.href}#${wordToFragment.get(word.id)}`,
            }),
            Epub.createXmlElement("audio", {
              src: `../Audio/${basename(word.audiofile)}`,
              clipBegin: `${word.start.toFixed(3)}s`,
              clipEnd: `${word.end.toFixed(3)}s`,
            }),
          ],
        ),
      ),
    )
  })
}
