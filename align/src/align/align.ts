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
import { dirname as autoDirname, extname, join as autoJoin } from "node:path"
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
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"
import { type RecognitionResult } from "@storyteller-platform/ghost-story/recognition"
import { type Mapping } from "@storyteller-platform/transliteration"

import { getTrackDuration } from "../common/ffmpeg.ts"
import { parseDom } from "../markup/parseDom.ts"
import { segmentChapter } from "../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../markup/transform.ts"
import {
  generateGuidedNavigationDocuments,
  generateGuidedNavigationManifest,
} from "../readium/guidedNavigation.ts"

import {
  type MappedTimeline,
  type SentenceRange,
  type StorytellerTranscription,
  type WordRange,
  collapseSentenceRangeGaps,
  expandEmptySentenceRanges,
  getChapterDuration,
  getSentenceRanges,
  mapTranscriptionTimeline,
} from "./getSentenceRanges.ts"
import { interpolateSentenceRanges } from "./interpolateSentenceRanges.ts"
import { findBoundaries } from "./search.ts"
import { slugify } from "./slugify.ts"
import { TextFragmentFactory } from "./textFragments.ts"

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
  transcriptionContext: {
    before: string
    after: string
  }
  endTranscriptionContext: {
    before: string
    after: string
  }

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

export async function align(
  input: string,
  output: string,
  transcriptionsDir: string,
  audiobookDir: string,
  options: AlignOptions,
) {
  const outFormat = options.outFormat ?? "epub"
  const epubPath =
    outFormat === "epub"
      ? autoJoin(
          tmpdir(),
          `storyteller-platform-align-${randomUUID()}`,
          basename(output),
        )
      : input

  using stack = new DisposableStack()
  stack.defer(() => {
    if (outFormat === "epub") {
      rmSync(dirname(epubPath), { recursive: true, force: true })
    }
  })

  if (outFormat === "epub") {
    await mkdir(dirname(epubPath), { recursive: true })
    await copyFile(input, epubPath)
  }

  const audiobookFiles = await readdir(audiobookDir).then((filenames) =>
    filenames
      .filter((f) => isAudioFile(f))
      .map((f) => autoJoin(audiobookDir, f)),
  )

  using epub = await Epub.from(epubPath)

  const transcriptions = await readdir(transcriptionsDir)
    .then((filenames) =>
      filenames
        .filter((f) => f.endsWith(".json"))
        .map((f) => autoJoin(transcriptionsDir, f)),
    )
    .then((filepaths) =>
      Promise.all(
        filepaths.map(async (p) => readFile(p, { encoding: "utf-8" })),
      ),
    )
    .then((contents) =>
      contents.map(
        (c) =>
          JSON.parse(c) as Pick<RecognitionResult, "transcript" | "timeline">,
      ),
    )
    // When we introduced ghost-story, we changed `wordTimeline`
    // to `timeline`. This means that old transcriptions have the
    // wrong shape, so we fix it here.
    .then((transcriptions) => {
      return transcriptions.map((transcription) => {
        if ("wordTimeline" in transcription) {
          return {
            ...transcription,
            timeline:
              transcription.wordTimeline as RecognitionResult["timeline"],
          }
        }
        return transcription
      })
    })

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    transcriptions,
    options.granularity,
    options.textRef,
    options.primaryLocale,
    options.logger,
  )

  const timing = await aligner.alignBook(options.onProgress)

  if (outFormat === "epub") {
    await epub.saveAndClose()
    await mkdir(dirname(output), { recursive: true })
    await copyFile(epubPath, output)
  } else {
    const guidedNavigationDocuments =
      await generateGuidedNavigationDocuments(epub)

    const manifest = generateGuidedNavigationManifest(
      new LocalizedString(
        (await epub.getTitle()) ?? basename(input, extname(input)),
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

export class Aligner {
  private transcription: StorytellerTranscription

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
    transcriptions: Pick<RecognitionResult, "transcript" | "timeline">[],
    granularity: "sentence" | "word" | null | undefined,
    textRef: "id-fragment" | "text-fragment" | null | undefined,
    private languageOverride?: Intl.Locale | null,
    private logger?: Logger | null,
  ) {
    this.transcription = concatTranscriptions(transcriptions, audiofiles)

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
        const { name, base } = parse(audiofile)

        const id = `audio_${name}`

        // Make sure this file hasn't already been added
        // from a previous chapter
        const manifest = await this.epub.getManifest()
        if (id in manifest) return

        const epubAudioFilename = `Audio/${base}`
        const duration = await getTrackDuration(audiofile)
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
    mapping: Mapping,
    transcriptionOffset: number,
    endTranscriptionOffset: number,
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

    const mappedTranscriptionOffset = mapping.invert().map(transcriptionOffset)
    const mappedEndTranscriptionOffset = mapping
      .invert()
      .map(endTranscriptionOffset)

    this.report.chapters.push({
      href: chapter.href,
      transcriptionOffset: mappedTranscriptionOffset,
      endTranscriptionOffset: mappedEndTranscriptionOffset,
      transcriptionContext: {
        before: this.transcription.transcript.slice(
          Math.max(0, mappedTranscriptionOffset - 80),
          mappedTranscriptionOffset,
        ),
        after: this.transcription.transcript.slice(
          mappedTranscriptionOffset,
          Math.min(
            mappedTranscriptionOffset + 80,
            this.transcription.transcript.length - 1,
          ),
        ),
      },
      endTranscriptionContext: {
        before: this.transcription.transcript.slice(
          Math.max(0, mappedEndTranscriptionOffset - 80),
          mappedEndTranscriptionOffset,
        ),
        after: this.transcription.transcript.slice(
          mappedEndTranscriptionOffset,
          Math.min(
            mappedEndTranscriptionOffset + 80,
            this.transcription.transcript.length - 1,
          ),
        ),
      },
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

  private async alignChapter(
    chapterId: string,
    transcriptionText: string,
    transcriptionOffset: number,
    transcriptionEndOffset: number,
    locale: Intl.Locale,
    mappedTimeline: MappedTimeline,
    mapping: Mapping,
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
    timing.end("read contents")

    timing.start("split to sentences")
    const chapterSentences = await this.getChapterSentences(chapterId)
    timing.end("split to sentences")

    timing.start("align sentences")
    const {
      sentenceRanges,
      wordRanges,
      transcriptionOffset: endTranscriptionOffset,
      firstFoundSentence,
      lastFoundSentence,
    } = await getSentenceRanges(
      transcriptionText,
      mappedTimeline,
      chapterSentences,
      chapterId,
      transcriptionOffset,
      transcriptionEndOffset,
      this.granularity,
      locale,
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
      startOffset: transcriptionOffset,
      endOffset: endTranscriptionOffset,
    })

    this.addChapterReport(
      chapter,
      chapterSentences,
      sentenceRanges,
      firstFoundSentence,
      lastFoundSentence,
      mapping,
      transcriptionOffset,
      endTranscriptionOffset,
    )

    return {
      lastSentenceRange: sentenceRanges.at(-1) ?? null,
      endTranscriptionOffset,
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

    for (const audiofile of this.audiofiles) {
      this.audioFileDurations[audiofile] = await getTrackDuration(audiofile)
    }

    const spine = await this.epub.getSpineItems()
    const manifest = await this.epub.getManifest()
    const { result: transcriptionText, mapping } = await slugify(
      this.transcription.transcript,
      locale,
    )

    const mappedTimeline = mapTranscriptionTimeline(this.transcription, mapping)

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
      for (const chapterSentence of chapterSentences) {
        slugifiedChapterSentences.push(
          (await slugify(chapterSentence.text, locale)).result,
        )
      }
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

      const boundaries = findBoundaries(
        slugifiedChapterSentences.join("-"),
        transcriptionText,
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
        transcriptionText,
        Math.max(start, 0),
        Math.min(end, transcriptionText.length),
        locale,
        mappedTimeline,
        mapping,
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

    for (const alignedChapter of audioOrderedChapters) {
      sentenceRanges.push(...alignedChapter.sentenceRanges)

      const sentences = await this.getChapterSentences(
        alignedChapter.chapter.id,
      )
      chapterSentenceCounts[alignedChapter.chapter.id] = sentences.length
    }

    const interpolated = interpolateSentenceRanges(
      sentenceRanges,
      chapterSentenceCounts,
      this.audioFileDurations,
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

export function concatTranscriptions(
  transcriptions: Pick<RecognitionResult, "transcript" | "timeline">[],
  audiofiles: string[],
) {
  return transcriptions.reduce<StorytellerTranscription>(
    (acc, transcription, index) => ({
      ...acc,
      transcript: acc.transcript + " " + transcription.transcript,
      timeline: [
        ...acc.timeline,
        ...transcription.timeline.map((entry) => ({
          ...entry,
          startOffsetUtf16:
            (entry.startOffsetUtf16 ?? 0) + acc.transcript.length + 1,
          endOffsetUtf16:
            (entry.endOffsetUtf16 ?? 0) + acc.transcript.length + 1,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          audiofile: audiofiles[index]!,
        })),
      ],
    }),
    { transcript: "", timeline: [] },
  )
}
